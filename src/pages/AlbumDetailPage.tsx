import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { MovePhotosSheet } from '../components/MovePhotosSheet'
import { LightboxToolbarButton, PhotoLightbox } from '../components/PhotoLightbox'
import { RenameModal } from '../components/RenameModal'
import {
  Badge,
  Button,
  ConfirmDialog,
  Header,
  IconDownload,
  IconFolderMove,
  IconTrash,
  LoadState,
  PhotoGrid,
  PhotoTile,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useAlive } from '../hooks/useAlive'
import { useMutation } from '../hooks/useMutation'
import { redirectIfUnauthorized, toErrorMessage } from '../api/client'
import {
  deletePhotos,
  getAlbumWithPhotos,
  getAlbumZip,
  markAlbumReviewed,
  renamePersonAlbum,
} from '../api/albums'
import { runWithConcurrency } from '../lib/concurrency'
import { downloadViaBlob } from '../lib/download'
import { cx } from '../lib/cx'
import type { ID } from '../types/api'

/**
 * 09. 앨범 상세 · node 211:1685 · GET /albums/:id · DELETE /photos · PATCH /albums/:id
 * 사진 그리드 + 선택 모드 → [저장](선택 사진 개별 저장 — 전체 선택이면 ZIP 한 번) · [삭제](현재 앨범
 * 연결만 해제, 마지막 연결이면 완전 삭제) · [옮기기](09-1 이동 시트) · [검토 완료](앨범 내 전 사진 일괄
 * reviewed). 일반 모드 하단 [다운로드] = 앨범 전체 ZIP(GET /albums/:id/download, CHMO-349 —
 * person/common만, 특수 앨범은 BE ZIP 미제공). 인물 앨범은 앨범명 옆 ✎로 이름 변경(모임 전체 이름전파).
 * 삭제는 확인 다이얼로그로 결과(완전 삭제 여부)를 명시하고, 선택모드의 검토 완료는 앨범 전체가 대상임을 확인받는다.
 * 일반 모드 사진 탭 = 라이트박스 크게 보기(CHMO-242) — 검수 배지(검토 상태·눈감음/흔들림) + 저장/삭제/옮기기.
 * 삭제·옮기기 대상은 pendingDelete/pendingMove(ID[])로 들고 선택모드·라이트박스가 같은 다이얼로그·시트를 공유한다.
 * (사진 단위 '검토' 액션은 BE API 미도입 — api-spec: 앨범 일괄만. 필요 시 후속 스토리.)
 */
export function AlbumDetailPage() {
  const {
    groupId = '',
    eventId = '',
    albumId: albumIdParam = '',
  } = useParams<{
    groupId: string
    eventId: string
    albumId: string
  }>()
  // 라우트 파라미터는 문자열 — API 계약(ID = number)에 맞춰 숫자로 변환(CHMO-191)
  const albumId = Number(albumIdParam)
  const toast = useToast()
  const navigate = useNavigate()
  const mutate = useMutation()
  const albumApi = useApi(`album:${albumId}`, (signal) => getAlbumWithPhotos(albumId, signal))

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  // 삭제/이동 대상 사진(null=닫힘) — 선택모드(선택 사진들)와 라이트박스(현재 1장)가 공유
  const [pendingDelete, setPendingDelete] = useState<ID[] | null>(null)
  const [pendingMove, setPendingMove] = useState<ID[] | null>(null)
  const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // 다운로드는 데이터를 바꾸지 않아 busy(그리드 잠금)와 분리 — 다운로드 버튼만 잠근다
  const [downloading, setDownloading] = useState(false)
  const alive = useAlive()

  const album = albumApi.data?.album
  const photos = albumApi.data?.photos ?? []
  const eventPath = `/groups/${groupId}/events/${eventId}`
  // 검토 상태는 손에 있는 사진 목록으로 직접 판정 — 계약상 optional인 unreviewedPhotoCount에 의존하지 않고
  // 0장 앨범이 공허하게 '완료'로 잡히는 것도 막는다
  const allReviewed = photos.length > 0 && photos.every((p) => p.reviewed)
  // 뮤테이션 진행 중(busy) + 성공 후 재조회 진행 중(loading) 동안 stale 그리드 조작을 잠근다
  // (재조회 전 setBusy(false)로 풀린 화면에서 이미 지운 사진을 다시 조작해 400 나는 것 방지)
  const locked = busy || albumApi.loading

  // 삭제 시 이 앨범이 마지막 연결인 사진(다른 앨범에 없음)은 완전 삭제된다(api-spec: 복구 불가)
  const deleteTargets = pendingDelete ?? []
  const orphanCount = photos.filter(
    (p) => deleteTargets.includes(p.id) && p.albumIds.length <= 1,
  ).length
  const deleteDescription =
    orphanCount === 0
      ? '이 앨범에서만 제거되고, 다른 앨범에는 그대로 남아요.'
      : orphanCount === deleteTargets.length
        ? '선택한 사진은 다른 앨범에 없어 완전히 삭제돼요. 되돌릴 수 없어요.'
        : `이 앨범에서 제거돼요. 이 중 ${orphanCount}장은 다른 앨범에도 없어 완전히 삭제돼요(되돌릴 수 없음).`

  // 삭제/이동으로 사진이 빠지면 배열이 줄어든다 — 인덱스를 남은 범위로 눌러 다음 사진을 이어 보여준다
  const lightboxIndex =
    viewIndex != null && photos.length > 0 ? Math.min(viewIndex, photos.length - 1) : null
  const lightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] : null

  const toggle = (id: ID) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // 롱프레스(꾹 누르기)로 선택모드 진입 + 해당 사진 선택 — 모바일 사진 앱 관용 UX(CHMO-243)
  const enterSelectWith = (id: ID) => {
    setSelectMode(true)
    setSelected(new Set([id]))
  }

  const allSelected = photos.length > 0 && selected.size === photos.length
  // 전체 선택/해제 토글 — 하나라도 빠졌으면 전체 선택, 다 찼으면 전체 해제
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.id)))

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  // 사진이 0장이 되면 BE가 앨범을 자동 삭제한다(CHMO-231) — refetch하면 404(ErrorState)를
  // 마주하므로, 남는 사진이 없을 땐 재조회 대신 이벤트 앨범 그리드(08)로 나간다(CHMO-289).
  // replace: 뒤로가기로 사라진 앨범에 되돌아오지 않게 한다.
  const exitToEventIfEmptied = (removedCount: number): boolean => {
    if (removedCount < photos.length) return false
    navigate(eventPath, { replace: true })
    return true
  }

  const handleDelete = async () => {
    const ids = pendingDelete ?? []
    if (ids.length === 0 || busy) return
    setBusy(true)
    await mutate(() => deletePhotos({ albumId, photoIds: ids }), {
      onSuccess: () => {
        setPendingDelete(null)
        if (selectMode) exitSelect()
        toast.show(`🧀 ${ids.length}장을 앨범에서 제거했어요`)
        if (exitToEventIfEmptied(ids.length)) return
        albumApi.refetch()
        setBusy(false)
      },
      onError: (msg) => {
        setPendingDelete(null)
        toast.show(msg)
        setBusy(false)
      },
    })
  }

  const handleReview = async () => {
    if (busy) return
    setBusy(true)
    await mutate(() => markAlbumReviewed(albumId), {
      onSuccess: () => {
        setReviewConfirmOpen(false)
        exitSelect()
        toast.show('🧀 검토 완료로 표시했어요')
        albumApi.refetch()
        setBusy(false)
      },
      onError: (msg) => {
        setReviewConfirmOpen(false)
        toast.show(msg)
        setBusy(false)
      },
    })
  }

  // BE 멤버 ZIP은 person/common만 대상 — 특수 앨범은 ALBUM404라 진입로를 숨긴다(getAlbumZip 주석)
  const zipEligible = album?.type === 'person' || album?.type === 'common'

  // 앨범 전체 ZIP 저장(미검토 포함) — 뷰어 16과 같은 흐름(URL 발급 → blob 저장)
  const downloadAlbumZip = async () => {
    const res = await getAlbumZip(albumId)
    if (!alive.current) return
    const ok = await downloadViaBlob(res.downloadUrl, `${album?.name ?? 'album'}.zip`)
    if (!alive.current) return
    toast.show(ok ? '🧀 다운로드를 시작했어요' : '다운로드하지 못했어요. 다시 시도해 주세요.')
  }

  // 선택 사진 개별 저장 — 원본을 한 장씩 blob 저장(커넥션 고갈 방지로 동시 3장 제한)
  const downloadSelectedPhotos = async (ids: ID[]) => {
    const targets = photos.filter((p) => ids.includes(p.id))
    let failed = 0
    await runWithConcurrency(targets, 3, async (photo) => {
      const ok = await downloadViaBlob(photo.downloadUrl ?? photo.url, `${photo.id}.jpg`)
      if (!ok) failed += 1
    })
    if (!alive.current) return
    toast.show(
      failed === 0
        ? `🧀 ${targets.length}장 저장을 시작했어요`
        : `${failed}장은 저장하지 못했어요. 다시 시도해 주세요.`,
    )
  }

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      // 전체 선택은 개별 N회 저장 대신 ZIP 한 번(브라우저 다중 다운로드 확인창 회피).
      // 특수 앨범은 ZIP이 없어 전체 선택이어도 개별 저장으로 간다.
      if (selectMode && !(allSelected && zipEligible)) {
        await downloadSelectedPhotos([...selected])
      } else {
        await downloadAlbumZip()
      }
      if (!alive.current) return
      setDownloading(false)
    } catch (err) {
      if (!alive.current) return
      if (redirectIfUnauthorized(err, navigate, { to: '/login' })) return
      toast.show(toErrorMessage(err))
      setDownloading(false)
    }
  }

  // 옮기기(09-1) 성공 — 시트 닫고 선택 해제 + 재조회로 그리드에 반영(라이트박스는 다음 사진으로 이어짐)
  const handleMoved = (movedCount: number, targetName: string) => {
    setPendingMove(null)
    if (selectMode) exitSelect()
    toast.show(`🧀 ${movedCount}장을 '${targetName}'(으)로 옮겼어요`)
    if (exitToEventIfEmptied(movedCount)) return
    albumApi.refetch()
  }

  const hasPhotos = photos.length > 0

  return (
    <PhoneShell>
      <Header
        backTo={eventPath}
        backLabel="이벤트 상세"
        backDisabled={busy}
        right={
          album && hasPhotos ? (
            <button
              type="button"
              disabled={locked}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={cx(
                'rounded-full px-3 py-1.5 text-xs font-bold',
                locked
                  ? 'bg-surface text-muted'
                  : selectMode
                    ? 'bg-surface text-text'
                    : 'bg-primary text-heading',
              )}
            >
              {selectMode ? '취소' : '선택'}
            </button>
          ) : undefined
        }
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 사진이 많아 프레임(844)을 넘을 수 있어 그리드는 스크롤, 하단 액션은 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          {album ? (
            <>
              <div className="flex items-center gap-2.5">
                <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-heading">
                  {album.name}
                </h1>
                {selectMode ? (
                  <div className="flex flex-none items-center gap-2">
                    <span className="text-[13px] font-medium text-muted">
                      {selected.size}장 선택
                    </span>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={toggleAll}
                      className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-bold text-accent disabled:opacity-50"
                    >
                      {allSelected ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                ) : album.type === 'person' ? (
                  // 인물 앨범만 이름 변경(모임 전체 이름전파). 특수 앨범은 고정 라벨이라 미노출
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setRenameOpen(true)}
                    className="inline-flex flex-none items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-bold text-accent disabled:opacity-50"
                  >
                    ✎ 이름
                  </button>
                ) : null}
              </div>

              {/* stale 데이터 위에서 refetch가 실패해도 보이게(성공 토스트와 화면 모순 방지) */}
              {albumApi.error && (
                <p role="alert" className="mt-3 text-sm text-warn">
                  {toErrorMessage(albumApi.error)}
                </p>
              )}

              {hasPhotos ? (
                <div className="mt-4">
                  <PhotoGrid>
                    {photos.map((photo, i) => (
                      <PhotoTile
                        key={photo.id}
                        src={photo.thumbnailUrl}
                        selectable={selectMode}
                        selected={selected.has(photo.id)}
                        // 탭: 선택모드=선택 토글 · 일반 모드=라이트박스 크게 보기(CHMO-242).
                        onClick={
                          locked
                            ? undefined
                            : selectMode
                              ? () => toggle(photo.id)
                              : () => setViewIndex(i)
                        }
                        // 롱프레스: 일반 모드에서 꾹 누르면 선택모드 진입 + 이 사진 선택(CHMO-243).
                        // 탭=확대 / 롱프레스=선택이라 라이트박스와 제스처가 겹치지 않는다.
                        onLongPress={
                          locked || selectMode ? undefined : () => enterSelectWith(photo.id)
                        }
                      />
                    ))}
                  </PhotoGrid>
                </div>
              ) : (
                <p className="py-11 text-center text-sm text-muted">이 앨범에 사진이 없어요.</p>
              )}
            </>
          ) : (
            <LoadState
              loading={albumApi.loading}
              error={albumApi.error}
              loadingText="앨범을 불러오는 중…"
              onRetry={albumApi.refetch}
              unauthorizedTo="/login"
              notFoundTo={`/groups/${groupId}/events/${eventId}`}
              notFoundLabel="이벤트 상세로"
            />
          )}
        </div>

        {album && hasPhotos && (
          <div className="flex gap-2.5 px-5 pb-safe-9 pt-4">
            {selectMode ? (
              // 4버튼이라 390px에 15px 라벨이 안 들어간다 — 13px로 줄여 한 줄 유지
              <>
                {/* 저장(다운로드) — 라이트박스 [저장]과 같은 라벨. 전체 선택이면 ZIP 한 번(handleDownload) */}
                <Button
                  variant="secondary"
                  className="flex-1 gap-1 whitespace-nowrap !px-1.5 !text-[13px]"
                  disabled={selected.size === 0 || locked || downloading}
                  onClick={handleDownload}
                >
                  <IconDownload size={17} />
                  {downloading ? '저장 중…' : '저장'}
                </Button>
                <Button
                  variant="warn"
                  className="flex-1 gap-1 whitespace-nowrap !px-1.5 !text-[13px]"
                  disabled={selected.size === 0 || locked}
                  onClick={() => setPendingDelete([...selected])}
                >
                  <IconTrash size={17} />
                  삭제
                </Button>
                <Button
                  variant="accent"
                  className="flex-1 gap-1 whitespace-nowrap !px-1.5 !text-[13px]"
                  disabled={selected.size === 0 || locked}
                  onClick={() => setPendingMove([...selected])}
                >
                  <IconFolderMove size={17} />
                  옮기기
                </Button>
                {/* 검토 완료는 선택과 무관하게 앨범 전체 대상 — 선택 옆에 있어 오해 소지가 있어 확인받는다 */}
                <Button
                  className="flex-1 whitespace-nowrap !px-1.5 !text-[13px]"
                  disabled={locked || allReviewed}
                  onClick={() => setReviewConfirmOpen(true)}
                >
                  검토 완료
                </Button>
              </>
            ) : (
              <>
                {/* 앨범 전체 ZIP — 특수 앨범(uncertain·눈감음·흔들림)은 BE에 ZIP이 없어 숨긴다 */}
                {zipEligible && (
                  <Button
                    variant="secondary"
                    className="flex-1 gap-1.5 !px-2"
                    disabled={downloading}
                    onClick={handleDownload}
                  >
                    {downloading ? (
                      '준비 중…'
                    ) : (
                      <>
                        <IconDownload size={18} />
                        다운로드
                      </>
                    )}
                  </Button>
                )}
                <Button
                  className="flex-1 !px-2"
                  disabled={locked || allReviewed}
                  onClick={handleReview}
                >
                  {allReviewed ? '검토 완료됨' : '검토 완료'}
                </Button>
              </>
            )}
          </div>
        )}
      </main>

      {/* 라이트박스(크게 보기) — 확인 다이얼로그·이동 시트가 이 위에 떠야 하므로 JSX상 이들보다 앞에 둔다(같은 z-40) */}
      {lightboxPhoto && lightboxIndex != null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
          disabled={locked || pendingDelete !== null || pendingMove !== null}
          info={(photo) => (
            <>
              <Badge variant={photo.reviewed ? 'reviewed' : 'unreviewed'} />
              {photo.flags?.eyesClosed && (
                <span className="rounded-full bg-warn px-[11px] py-1.5 text-xs font-bold text-white">
                  눈감음
                </span>
              )}
              {photo.flags?.blurry && (
                <span className="rounded-full bg-warn px-[11px] py-1.5 text-xs font-bold text-white">
                  흔들림
                </span>
              )}
            </>
          )}
          actions={(photo) => (
            <>
              <LightboxToolbarButton
                icon={<IconFolderMove />}
                label="옮기기"
                disabled={locked}
                onClick={() => setPendingMove([photo.id])}
              />
              {/* 삭제는 iOS 사진 앱 휴지통처럼 맨 오른쪽 */}
              <LightboxToolbarButton
                tone="warn"
                icon={<IconTrash />}
                label="삭제"
                disabled={locked}
                onClick={() => setPendingDelete([photo.id])}
              />
            </>
          )}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        busy={busy}
        busyLabel="삭제 중…"
        title={`사진 ${deleteTargets.length}장을 삭제할까요?`}
        description={deleteDescription}
        confirmLabel="삭제"
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={reviewConfirmOpen}
        busy={busy}
        busyLabel="처리 중…"
        title="앨범 전체를 검토 완료할까요?"
        // 검토 완료는 표시일 뿐 노출이 아니다(재공개 게이트 CHMO-324) — 이벤트 상태와 무관하게 참인 문구(CHMO-265)
        description={`선택과 상관없이 이 앨범의 사진 ${photos.length}장이 모두 검토 완료로 표시돼요. 학부모에게 보이려면 이벤트를 [공개하기]로 공개해야 해요.`}
        confirmLabel="전체 검토 완료"
        onConfirm={handleReview}
        onClose={() => setReviewConfirmOpen(false)}
      />

      {/* 09-1 옮기기 시트 — 대상 사진(선택모드 선택분 또는 라이트박스 현재 1장)을 유사도 추천/공통 앨범으로
          이동(연결 교체). 열려 있을 때만 마운트해 매 오픈이 새 대상 기준으로 추천을 다시 받게 한다(stale 방지). */}
      {album && pendingMove && (
        <MovePhotosSheet
          onClose={() => setPendingMove(null)}
          sourceAlbumId={albumId}
          photoIds={pendingMove}
          onMoved={handleMoved}
        />
      )}

      {/* 인물 앨범 이름 변경(모임 전체 이름전파). 로컬 캐시가 없어 현재 앨범만 refetch하면
          다른 이벤트의 같은 personId 앨범은 다음 진입 시 갱신된 이름으로 조회된다 */}
      {album?.type === 'person' && (
        <RenameModal
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          title="아이 이름 수정"
          label="아이 이름"
          placeholder="예) 김민준"
          initialName={album.name}
          submit={(name) => renamePersonAlbum(albumId, name)}
          successMessage="🧀 아이 이름을 바꿨어요"
          onRenamed={albumApi.refetch}
          note="이 이름은 같은 모임의 모든 이벤트에 함께 반영돼요."
        />
      )}
    </PhoneShell>
  )
}
