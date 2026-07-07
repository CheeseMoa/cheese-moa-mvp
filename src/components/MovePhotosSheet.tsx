import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { apiFetch, ApiRequestError, toErrorMessage } from '../lib/api'
import { cx } from '../lib/cx'
import type { MovePhotosResponse, MoveSuggestion } from '../types/api'
import { BottomSheet, Button, useToast } from './ui'

interface MovePhotosSheetProps {
  onClose: () => void
  /** 원본(현재) 앨범 — 이동 시 연결이 해제된다 */
  sourceAlbumId: string
  /** 이동할 선택 사진 — 시트를 여는 시점의 선택으로 고정 */
  photoIds: string[]
  /** 이동 성공 — 부모가 시트를 닫고(언마운트) 선택 해제 + 상세 refetch */
  onMoved: (movedCount: number, targetName: string) => void
}

/**
 * 09-1 사진 이동 바텀시트 · node 211:1866 · GET /albums/:id/move-suggestions · POST /photos/move
 * 유사도 높은 순 인물 앨범(원형 아바타 + %) + 공통 사진첩(고정 옵션). 대상을 탭하면
 * 현재 앨범 연결을 해제하고 대상 앨범에 연결한다(다대다 연결 교체 — 복사 아님).
 * **열려 있을 때만 마운트**된다(부모가 `moveOpen`으로 게이트) — 매 오픈이 새 마운트라
 * 이전 선택의 추천/진행 상태가 남지 않는다(useApi·busy가 깨끗하게 시작).
 */
export function MovePhotosSheet({
  onClose,
  sourceAlbumId,
  photoIds,
  onMoved,
}: MovePhotosSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const query = photoIds.join(',')
  const { data, error, loading, refetch } = useApi<{ suggestions: MoveSuggestion[] }>(
    photoIds.length > 0 ? `/albums/${sourceAlbumId}/move-suggestions?photoIds=${query}` : null,
  )
  const [busy, setBusy] = useState(false)
  // 동기 락 — setBusy 반영(리렌더) 전 같은 프레임에 들어온 연타·다중 아바타 탭이
  // 두 번 이동(두 번째는 이미 원본에서 빠진 사진이라 400)하는 것을 막는다.
  const busyRef = useRef(false)

  // 이동 요청 중 프레임을 떠나면(브라우저/제스처 뒤로가기 — 인앱 뒤로가기는 스크림이 가림)
  // 늦게 온 응답이 언마운트된 시트에서 토스트·이동·로그인 이동을 실행하지 않게 하는 플래그
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도해도 영원히 실패하므로 로그인으로 복귀
  if (error?.status === 401) return <Navigate to="/login" replace />

  const suggestions = data?.suggestions ?? []

  const handleMove = async (target: MoveSuggestion) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const res = await apiFetch<MovePhotosResponse>('/photos/move', {
        method: 'POST',
        body: { photoIds, sourceAlbumId, targetAlbumId: target.albumId },
      })
      if (!alive.current) return
      // 성공: 부모가 시트를 닫고(언마운트) 선택 해제 + refetch 한다
      onMoved(res.movedCount, target.name)
    } catch (err) {
      if (!alive.current) return
      if (err instanceof ApiRequestError && err.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      toast.show(toErrorMessage(err))
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      title="다른 사진첩으로 옮기기"
      subtitle="유사도가 높은 순으로 추천해요"
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-center text-sm text-warn">{toErrorMessage(error)}</p>
          <Button size="sm" variant="secondary" onClick={refetch}>
            다시 시도
          </Button>
        </div>
      ) : suggestions.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">옮길 만한 다른 앨범이 없어요.</p>
      ) : (
        // 추천 5개가 프레임 너비를 넘을 수 있어 가로 스크롤
        <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
          {suggestions.map((s) => {
            const isCommon = s.similarity === null
            return (
              <button
                key={s.albumId}
                type="button"
                disabled={busy}
                onClick={() => handleMove(s)}
                className="flex w-16 flex-none flex-col items-center gap-1.5 transition active:scale-[0.97] disabled:opacity-50"
              >
                <span
                  className={cx(
                    'cheese-dots h-16 w-16 rounded-full bg-photo',
                    isCommon ? 'border-2 border-border' : 'border-2 border-primary',
                  )}
                  aria-hidden="true"
                />
                <span className="max-w-full truncate text-xs font-bold text-text">{s.name}</span>
                <span
                  className={cx('text-[11px]', isCommon ? 'text-muted' : 'font-bold text-accent')}
                >
                  {isCommon ? '사진첩' : `${Math.round((s.similarity ?? 0) * 100)}%`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
