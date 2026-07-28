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
import { useMutation } from '../hooks/useMutation'
import { usePhotoSave, photoSaveLabel } from '../hooks/usePhotoSave'
import { toErrorMessage } from '../api/client'
import {
  deleteAlbum,
  deletePhotos,
  getAlbumWithPhotos,
  markAlbumReviewed,
  renamePersonAlbum,
} from '../api/albums'
import { cx } from '../lib/cx'
import { uncertainCauseMessages } from '../lib/uncertainCauses'
import type { ID } from '../types/api'

/**
 * 09. 앨범 상세 · node 211:1685 · GET /albums/:id · DELETE /photos · PATCH /albums/:id
 * 사진 그리드 + 선택 모드 → [저장](선택 사진 앨범 저장 — usePhotoSave, CHMO-473) · [삭제](현재 앨범
 * 연결만 해제, 마지막 연결이면 완전 삭제) · [옮기기](09-1 이동 시트). 일반 모드 하단 [다운로드] = 앨범
 * 전체 저장(미검토 포함 — ZIP 폐지·개별 요청 전환, 노출은 person/common만 CHMO-349 규칙 유지) ·
 * [검토 완료] = 앨범 내 전 사진 일괄 reviewed, 성공 시 08 앨범 그리드로 복귀(CHMO-414 — 검토는 앨범
 * 단위 진행이라 완료하면 다음 앨범으로 이어가게. 앨범 전체 대상이라 선택모드와 이질적이던 버튼은 제거, CHMO-413).
 * 인물 앨범은 앨범명 옆 ✎로 이름 변경(모임 전체 이름전파). 삭제는 확인 다이얼로그로 결과(완전 삭제 여부)를 명시한다.
 * 앨범 삭제(CHMO-435 — 전 타입): 앨범명 줄 🗑 → 확인 다이얼로그(이 앨범에만 있는 사진은 영구 삭제 경고) →
 * DELETE /albums/:id → 08 복귀(replace). 사진 전량 삭제·이동으로 앨범이 비어도 앨범은 남는다(CHMO-418 —
 * 자동 삭제 폐지, CHMO-289 복귀 동작 반전): 잔류 + refetch로 빈 상태를 보여주고 삭제는 수동뿐.
 * 일반 모드 사진 탭 = 라이트박스 크게 보기(CHMO-242) — 검수 배지(검토 상태·눈감음/흔들림) + 저장/삭제/옮기기.
 * 삭제·옮기기 대상은 pendingDelete/pendingMove(ID[])로 들고 선택모드·라이트박스가 같은 다이얼로그·시트를 공유한다.
 * (사진 단위 '검토' 액션은 BE API 미도입 — api-spec: 앨범 일괄만. 필요 시 후속 스토리.)
 * uncertain(분류가 어려워요) 앨범은 검토 UI(라이트박스 배지·[검토 완료])를 노출하지 않는다 — 검토·발행
 * 대상이 인물·공통뿐이라(CHMO-357, 08 카드 규칙과 동일) 대신 분류 사유·애매 얼굴 bbox를 보여준다(CHMO-412).
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
  const [deleteAlbumOpen, setDeleteAlbumOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // 앨범 저장 파이프라인(CHMO-473) — 데이터를 바꾸지 않아 busy(그리드 잠금)와 분리.
  // iOS는 공유 시트('이미지 저장' → 사진 앱), 그 외는 장별 다운로드. 선택모드 [저장]과
  // 일반 모드 [다운로드](앨범 전체·미검토 포함)가 한 인스턴스를 공유한다(동시 노출 없음).
  const save = usePhotoSave()

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
    // 선택 저장이 준비/대기 중이었다면 폐기 — 일반 모드 버튼이 이어받지 않게
    save.reset()
  }

  // 사진이 0장이 돼도 앨범은 남는다(CHMO-418 — 자동 삭제 폐지, CHMO-289 복귀 동작 반전):
  // 나가지 않고 refetch로 빈 상태를 보여준다. 앨범을 없애는 건 수동 삭제(아래 handleDeleteAlbum)뿐.
  const handleDelete = async () => {
    const ids = pendingDelete ?? []
    if (ids.length === 0 || busy) return
    setBusy(true)
    await mutate(() => deletePhotos({ albumId, photoIds: ids }), {
      onSuccess: () => {
        setPendingDelete(null)
        if (selectMode) exitSelect()
        toast.show(`🧀 ${ids.length}장을 앨범에서 제거했어요`)
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

  // 앨범 삭제(CHMO-435 — 전 타입 허용): 이 앨범에만 속한 사진은 함께 영구 삭제된다(CHMO-271).
  // 성공 시 앨범이 사라졌으니 08로 복귀(replace — 뒤로가기로 죽은 앨범에 되돌아오지 않게, CHMO-289 선례).
  const handleDeleteAlbum = async () => {
    if (busy) return
    setBusy(true)
    await mutate(() => deleteAlbum(albumId), {
      onSuccess: () => {
        toast.show(`🧀 '${album?.name ?? '앨범'}'을 삭제했어요`)
        navigate(eventPath, { replace: true })
      },
      onError: (msg) => {
        setDeleteAlbumOpen(false)
        toast.show(msg)
        setBusy(false)
      },
    })
  }

  // 앨범 삭제 시 완전 삭제될 사진 수 — 이 앨범에만 연결된 사진(다른 앨범 사본은 남는다)
  const albumOrphanCount = photos.filter((p) => p.albumIds.length <= 1).length
  const deleteAlbumDescription =
    photos.length === 0
      ? '비어 있는 앨범이에요. 삭제해도 다른 사진에는 영향이 없어요.'
      : albumOrphanCount === 0
        ? `사진 ${photos.length}장이 이 앨범에서 제거돼요. 모두 다른 앨범에도 있어 사진은 남아요.`
        : albumOrphanCount === photos.length
          ? `사진 ${photos.length}장이 함께 완전히 삭제돼요. 되돌릴 수 없어요.`
          : `사진 ${photos.length}장 중 ${albumOrphanCount}장은 다른 앨범에 없어 완전히 삭제돼요(되돌릴 수 없음).`

  const handleReview = async () => {
    if (busy) return
    setBusy(true)
    await mutate(() => markAlbumReviewed(albumId), {
      onSuccess: () => {
        toast.show('🧀 검토 완료로 표시했어요')
        // 검토는 앨범 단위 진행이라 완료하면 08로 복귀해 다음 앨범으로 이어가게 한다(CHMO-414).
        // 앨범이 그대로 있어 뒤로가기로 돌아와도 무해하므로 CHMO-289와 달리 replace가 아닌 push.
        navigate(eventPath)
      },
      onError: (msg) => {
        toast.show(msg)
        setBusy(false)
      },
    })
  }

  // 일반 모드 [다운로드] 노출은 person/common만 — ZIP 폐지(CHMO-473)로 기술 제약(BE ZIP
  // ALBUM404)은 사라졌지만, 품질 제외 앨범의 일괄 저장 노출은 별도 결정 전까지 기존 규칙 유지
  const bulkSaveEligible = album?.type === 'person' || album?.type === 'common'

  const handleSave = (targets: typeof photos) => {
    if (save.state.phase === 'ready') {
      save.shareNext()
      return
    }
    void save.start(
      targets.map((p) => ({ url: p.downloadUrl ?? p.url, filename: `${p.id}.jpg` })),
    )
  }

  // 옮기기(09-1) 성공 — 시트 닫고 선택 해제 + 재조회로 그리드에 반영(라이트박스는 다음 사진으로 이어짐).
  // 전량 이동으로 앨범이 비어도 남는다(CHMO-418) — refetch가 빈 상태를 보여준다.
  const handleMoved = (movedCount: number, targetName: string) => {
    setPendingMove(null)
    if (selectMode) exitSelect()
    toast.show(`🧀 ${movedCount}장을 '${targetName}'(으)로 옮겼어요`)
    albumApi.refetch()
  }

  // 새 앨범 생성(09-1 "새 앨범", CHMO-435) 성공 — 생성이 곧 이동이라 후속은 handleMoved와 동일
  const handleCreated = (albumName: string, movedCount: number) => {
    setPendingMove(null)
    if (selectMode) exitSelect()
    toast.show(`🧀 '${albumName}' 앨범을 만들고 ${movedCount}장을 옮겼어요`)
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
                ) : (
                  <div className="flex flex-none items-center gap-2">
                    {/* 인물 앨범만 이름 변경(모임 전체 이름전파). 특수 앨범은 고정 라벨이라 미노출 */}
                    {album.type === 'person' && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setRenameOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-bold text-accent disabled:opacity-50"
                      >
                        ✎ 이름
                      </button>
                    )}
                    {/* 앨범 삭제(CHMO-435) — 전 타입. 빈 앨범도 여기(+ 하단 CTA)로 지운다 */}
                    <button
                      type="button"
                      aria-label="앨범 삭제"
                      disabled={locked}
                      onClick={() => setDeleteAlbumOpen(true)}
                      className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1.5 text-warn disabled:opacity-50"
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                )}
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
                // 빈 앨범(CHMO-418 — 0장이어도 남는다): 옮겨 채우거나 아래 CTA로 수동 삭제
                <div className="py-11 text-center">
                  <p className="text-sm text-muted">이 앨범에 사진이 없어요.</p>
                  <p className="mt-1.5 text-xs text-muted">
                    다른 앨범에서 사진을 옮겨 오면 다시 채워져요.
                  </p>
                </div>
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

        {/* 빈 앨범 하단 CTA — 검토·다운로드가 모두 무의미하니 삭제만(앨범명 줄 🗑과 같은 다이얼로그) */}
        {album && !hasPhotos && (
          <div className="px-5 pb-safe-9 pt-4">
            <Button
              variant="warn"
              fullWidth
              className="gap-1.5"
              disabled={locked}
              onClick={() => setDeleteAlbumOpen(true)}
            >
              <IconTrash size={18} />
              앨범 삭제
            </Button>
          </div>
        )}

        {/* uncertain 앨범은 검토·발행 대상이 아니라(인물·공통만 — CHMO-357) 일반 모드 하단 바가
            통째로 비므로 숨긴다([다운로드]도 특수 앨범엔 없음). 선택모드 바(저장·삭제·옮기기)는 유지 */}
        {album && hasPhotos && (selectMode || album.type !== 'uncertain') && (
          <div className="flex gap-2.5 px-5 pb-safe-9 pt-4">
            {selectMode ? (
              save.state.phase !== 'idle' ? (
                // 저장 플로우 진행 중 — 긴 라벨(사진 앱에 저장 1/N)이 잘리지 않게 전폭 단독 노출
                <Button
                  variant="secondary"
                  className="flex-1 whitespace-nowrap !px-2"
                  disabled={save.busy}
                  onClick={save.shareNext}
                >
                  {photoSaveLabel(save.state)}
                </Button>
              ) : (
                <>
                  {/* 저장 — 라이트박스 [저장]과 같은 라벨. 선택 사진을 앨범 저장 파이프라인으로 */}
                  <Button
                    variant="secondary"
                    className="flex-1 gap-1.5 whitespace-nowrap !px-2"
                    disabled={selected.size === 0 || locked}
                    onClick={() => handleSave(photos.filter((p) => selected.has(p.id)))}
                  >
                    <IconDownload size={18} />
                    저장
                  </Button>
                  <Button
                    variant="warn"
                    className="flex-1 gap-1.5 whitespace-nowrap !px-2"
                    disabled={selected.size === 0 || locked}
                    onClick={() => setPendingDelete([...selected])}
                  >
                    <IconTrash size={18} />
                    삭제
                  </Button>
                  <Button
                    variant="accent"
                    className="flex-1 gap-1.5 whitespace-nowrap !px-2"
                    disabled={selected.size === 0 || locked}
                    onClick={() => setPendingMove([...selected])}
                  >
                    <IconFolderMove size={18} />
                    옮기기
                  </Button>
                </>
              )
            ) : (
              <>
                {/* 앨범 전체 저장(미검토 포함) — 개별 요청 파이프라인(CHMO-473, ZIP 폐지) */}
                {bulkSaveEligible && (
                  <Button
                    variant="secondary"
                    className="flex-1 gap-1.5 whitespace-nowrap !px-2"
                    disabled={save.busy}
                    onClick={() => handleSave(photos)}
                  >
                    {photoSaveLabel(save.state) ?? (
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
              {/* uncertain은 검토 대상이 아니라 배지 대신 분류 사유가 주인공이다(08 카드도 배지 없음) */}
              {album?.type !== 'uncertain' && (
                <Badge variant={photo.reviewed ? 'reviewed' : 'unreviewed'} />
              )}
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
              {/* 분류가 어려웠던 이유 — uncertain 앨범에서만, 표시된 bbox(애매 얼굴)와 세트(CHMO-412) */}
              {album?.type === 'uncertain' &&
                uncertainCauseMessages(photo.causes).map((message) => (
                  <span
                    key={message}
                    className="rounded-xl bg-surface/95 px-3 py-1.5 text-center text-xs font-medium text-text"
                  >
                    {message}
                  </span>
                ))}
            </>
          )}
          faceBboxes={
            // 애매 얼굴 bbox는 uncertain 앨범에서만 — 인물 앨범으로 옮긴 뒤엔 사유가 더는 유효하지 않다
            album?.type === 'uncertain' ? (photo) => photo.faceBboxes : undefined
          }
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

      {/* 앨범 삭제 확인(CHMO-435) — 사진이 있으면 함께 삭제됨(N:M 사본 제외)을 명시한다 */}
      <ConfirmDialog
        open={deleteAlbumOpen}
        danger
        busy={busy}
        busyLabel="삭제 중…"
        title={`'${album?.name ?? '앨범'}'을 삭제할까요?`}
        description={deleteAlbumDescription}
        confirmLabel="삭제"
        onConfirm={handleDeleteAlbum}
        onClose={() => setDeleteAlbumOpen(false)}
      />

      {/* 09-1 옮기기 시트 — 대상 사진(선택모드 선택분 또는 라이트박스 현재 1장)을 유사도 추천/공통 앨범으로
          이동(연결 교체). 열려 있을 때만 마운트해 매 오픈이 새 대상 기준으로 추천을 다시 받게 한다(stale 방지). */}
      {album && pendingMove && (
        <MovePhotosSheet
          onClose={() => setPendingMove(null)}
          eventId={Number(eventId)}
          sourceAlbumId={albumId}
          sourceAlbumType={album.type}
          photoIds={pendingMove}
          onMoved={handleMoved}
          onCreated={handleCreated}
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
          // 현재 이름은 지우지 않아도 되게 회색 placeholder로만 — 입력은 비워서 연다(CHMO-429)
          placeholder={album.name}
          prefill={false}
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
