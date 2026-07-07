import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { MovePhotosSheet } from '../components/MovePhotosSheet'
import { RenameModal } from '../components/RenameModal'
import { Button, ConfirmDialog, Header, PhotoGrid, PhotoTile, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { apiFetch, ApiRequestError, toErrorMessage } from '../lib/api'
import { cx } from '../lib/cx'
import type { Album, Photo, RemovePhotosResponse } from '../types/api'

interface AlbumDetailResponse {
  album: Album
  photos: Photo[]
}

/**
 * 09. 앨범 상세 · node 211:1685 · GET /albums/:id · DELETE /photos · PATCH /albums/:id
 * 사진 그리드 + 선택 모드 → [삭제](현재 앨범 연결만 해제, 마지막 연결이면 완전 삭제) · [옮기기](09-1 이동 시트) ·
 * [검토 완료](앨범 내 전 사진 일괄 reviewed). 인물 앨범은 앨범명 옆 ✎로 이름 변경(모임 전체 이름전파).
 * 삭제는 확인 다이얼로그로 결과(완전 삭제 여부)를 명시하고, 선택모드의 검토 완료는 앨범 전체가 대상임을 확인받는다.
 */
export function AlbumDetailPage() {
  const {
    groupId = '',
    eventId = '',
    albumId = '',
  } = useParams<{
    groupId: string
    eventId: string
    albumId: string
  }>()
  const navigate = useNavigate()
  const toast = useToast()
  const albumApi = useApi<AlbumDetailResponse>(`/albums/${albumId}`)

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // 제출 중 화면을 떠난 뒤 뒤늦게 온 응답이 상태 갱신을 실행하지 않게 하는 플래그
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도해도 영원히 실패하므로 로그인으로 복귀
  if (albumApi.error?.status === 401) return <Navigate to="/login" replace />

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
  const orphanCount = photos.filter((p) => selected.has(p.id) && p.albumIds.length <= 1).length
  const deleteDescription =
    orphanCount === 0
      ? '이 앨범에서만 제거되고, 다른 앨범에는 그대로 남아요.'
      : orphanCount === selected.size
        ? '선택한 사진은 다른 앨범에 없어 완전히 삭제돼요. 되돌릴 수 없어요.'
        : `이 앨범에서 제거돼요. 이 중 ${orphanCount}장은 다른 앨범에도 없어 완전히 삭제돼요(되돌릴 수 없음).`

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const handleDelete = async () => {
    const count = selected.size
    if (count === 0 || busy) return
    setBusy(true)
    try {
      await apiFetch<RemovePhotosResponse>('/photos', {
        method: 'DELETE',
        body: { albumId, photoIds: [...selected] },
      })
      if (!alive.current) return
      setConfirmOpen(false)
      exitSelect()
      toast.show(`🧀 ${count}장을 앨범에서 제거했어요`)
      albumApi.refetch()
      setBusy(false)
    } catch (err) {
      if (!alive.current) return
      if (err instanceof ApiRequestError && err.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      setConfirmOpen(false)
      toast.show(toErrorMessage(err))
      setBusy(false)
    }
  }

  const handleReview = async () => {
    if (busy) return
    setBusy(true)
    try {
      await apiFetch<Album>(`/albums/${albumId}`, {
        method: 'PATCH',
        body: { reviewed: true },
      })
      if (!alive.current) return
      setReviewConfirmOpen(false)
      exitSelect()
      toast.show('🧀 검토 완료로 표시했어요')
      albumApi.refetch()
      setBusy(false)
    } catch (err) {
      if (!alive.current) return
      if (err instanceof ApiRequestError && err.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      setReviewConfirmOpen(false)
      toast.show(toErrorMessage(err))
      setBusy(false)
    }
  }

  // 옮기기(09-1) 성공 — 시트 닫고 선택 해제 + 재조회로 그리드에 반영
  const handleMoved = (movedCount: number, targetName: string) => {
    setMoveOpen(false)
    exitSelect()
    toast.show(`🧀 ${movedCount}장을 '${targetName}'(으)로 옮겼어요`)
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
                  <span className="flex-none text-[13px] font-medium text-muted">
                    {selected.size}장 선택
                  </span>
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
                    {photos.map((photo) => (
                      <PhotoTile
                        key={photo.id}
                        src={photo.thumbnailUrl}
                        selectable={selectMode}
                        selected={selected.has(photo.id)}
                        onClick={selectMode && !locked ? () => toggle(photo.id) : undefined}
                      />
                    ))}
                  </PhotoGrid>
                </div>
              ) : (
                <p className="py-11 text-center text-sm text-muted">이 앨범에 사진이 없어요.</p>
              )}
            </>
          ) : albumApi.loading ? (
            <p className="py-11 text-center text-sm text-muted">앨범을 불러오는 중…</p>
          ) : albumApi.error ? (
            <div className="flex flex-col items-center gap-3 py-11">
              <p className="text-center text-sm text-warn">{toErrorMessage(albumApi.error)}</p>
              <Button size="sm" variant="secondary" onClick={albumApi.refetch}>
                다시 시도
              </Button>
            </div>
          ) : null}
        </div>

        {album && hasPhotos && (
          <div className="flex gap-2.5 px-5 pb-9 pt-4">
            {selectMode ? (
              <>
                <Button
                  variant="warn"
                  className="flex-1 !px-2"
                  disabled={selected.size === 0 || locked}
                  onClick={() => setConfirmOpen(true)}
                >
                  삭제
                </Button>
                <Button
                  variant="accent"
                  className="flex-1 !px-2"
                  disabled={selected.size === 0 || locked}
                  onClick={() => setMoveOpen(true)}
                >
                  옮기기
                </Button>
                {/* 검토 완료는 선택과 무관하게 앨범 전체 대상 — 선택 옆에 있어 오해 소지가 있어 확인받는다 */}
                <Button
                  className="flex-1 !px-2"
                  disabled={locked || allReviewed}
                  onClick={() => setReviewConfirmOpen(true)}
                >
                  검토 완료
                </Button>
              </>
            ) : (
              <Button fullWidth disabled={locked || allReviewed} onClick={handleReview}>
                {allReviewed ? '검토 완료됨' : '검토 완료'}
              </Button>
            )}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmOpen}
        danger
        busy={busy}
        busyLabel="삭제 중…"
        title={`사진 ${selected.size}장을 삭제할까요?`}
        description={deleteDescription}
        confirmLabel="삭제"
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={reviewConfirmOpen}
        busy={busy}
        busyLabel="처리 중…"
        title="앨범 전체를 검토 완료할까요?"
        description={`선택과 상관없이 이 앨범의 사진 ${photos.length}장이 모두 검토 완료로 표시되고, 검토된 사진은 학부모에게 공개돼요.`}
        confirmLabel="전체 검토 완료"
        onConfirm={handleReview}
        onClose={() => setReviewConfirmOpen(false)}
      />

      {/* 09-1 옮기기 시트 — 선택 사진을 유사도 추천/공통 앨범으로 이동(연결 교체).
          열려 있을 때만 마운트해 매 오픈이 새 선택 기준으로 추천을 다시 받게 한다(stale 방지). */}
      {album && moveOpen && (
        <MovePhotosSheet
          onClose={() => setMoveOpen(false)}
          sourceAlbumId={albumId}
          photoIds={[...selected]}
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
          submit={(name) => apiFetch(`/albums/${albumId}`, { method: 'PATCH', body: { name } })}
          successMessage="🧀 아이 이름을 바꿨어요"
          onRenamed={albumApi.refetch}
          note="이 이름은 같은 모임의 모든 이벤트에 함께 반영돼요."
        />
      )}
    </PhoneShell>
  )
}
