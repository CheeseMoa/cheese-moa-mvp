import { useRef, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { useDragScrollX } from '../hooks/useDragScrollX'
import { useMutation } from '../hooks/useMutation'
import { getMoveSuggestions, movePhotos } from '../api/albums'
import { cx } from '../lib/cx'
import type { AlbumType, ID, MoveSuggestion } from '../types/api'
import { BottomSheet, LoadState, useToast } from './ui'

interface MovePhotosSheetProps {
  onClose: () => void
  /** 원본(현재) 앨범 — 이동 시 연결이 해제된다 */
  sourceAlbumId: ID
  /** 원본 앨범 type — 인물이 아니면(분류가 어려워요·공통) 유사도 부제를 숨긴다(CHMO-429) */
  sourceAlbumType: AlbumType
  /** 이동할 선택 사진 — 시트를 여는 시점의 선택으로 고정 */
  photoIds: ID[]
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
  sourceAlbumType,
  photoIds,
  onMoved,
}: MovePhotosSheetProps) {
  const toast = useToast()
  const mutate = useMutation()
  const query = photoIds.join(',')
  const { data, error, loading, refetch } = useApi(
    photoIds.length > 0 ? `move-suggestions:${sourceAlbumId}:${query}` : null,
    (signal) => getMoveSuggestions(sourceAlbumId, photoIds, signal),
  )
  const dragScroll = useDragScrollX()
  const [busy, setBusy] = useState(false)
  // 동기 락 — setBusy 반영(리렌더) 전 같은 프레임에 들어온 연타·다중 아바타 탭이
  // 두 번 이동(두 번째는 이미 원본에서 빠진 사진이라 400)하는 것을 막는다.
  const busyRef = useRef(false)

  const suggestions = data ?? []

  const handleMove = async (target: MoveSuggestion) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    await mutate(() => movePhotos({ photoIds, sourceAlbumId, targetAlbumId: target.albumId }), {
      // 성공: 부모가 시트를 닫고(언마운트) 선택 해제 + refetch 한다
      onSuccess: (res) => onMoved(res.movedCount, target.name),
      onError: (msg) => {
        toast.show(msg)
        busyRef.current = false
        setBusy(false)
      },
    })
  }

  return (
    <BottomSheet
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      title="다른 사진첩으로 옮기기"
      // 유사도 부제는 인물 원본에서만 — 분류가 어려워요·공통에선 유사도가 미계산(null)일 수 있어
      // %도 없이 문구만 남아 어긋난다(CHMO-429, 피드백 스코프 그대로)
      subtitle={sourceAlbumType === 'person' ? '유사도가 높은 순으로 추천해요' : undefined}
    >
      {loading || error ? (
        <LoadState
          loading={loading}
          error={error}
          onRetry={refetch}
          unauthorizedTo="/login"
          className="py-8"
        />
      ) : suggestions.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">옮길 만한 다른 앨범이 없어요.</p>
      ) : (
        // 추천 5개가 프레임 너비를 넘을 수 있어 가로 스크롤 — 마우스는 끌어서(CHMO-345)
        <div {...dragScroll} className="mt-2 flex select-none gap-3 overflow-x-auto pb-1">
          {suggestions.map((s) => {
            // 공통 판정은 매퍼가 BE type에서 파생한 isCommon — similarity는 실 BE가
            // 인물 앨범에도 null을 줘 판별자로 못 쓴다(CHMO-399)
            const isCommon = s.isCommon
            return (
              <button
                key={s.albumId}
                type="button"
                disabled={busy}
                onClick={() => handleMove(s)}
                className="flex w-16 flex-none flex-col items-center gap-1.5 transition active:scale-[0.97] disabled:opacity-50"
              >
                {s.thumbnailUrl ? (
                  <img
                    src={s.thumbnailUrl}
                    alt=""
                    // 마우스 끌기 스크롤(useDragScrollX)과 충돌하는 네이티브 이미지 드래그 차단
                    draggable={false}
                    className={cx(
                      'h-16 w-16 rounded-full object-cover',
                      isCommon ? 'border-2 border-border' : 'border-2 border-primary',
                    )}
                  />
                ) : (
                  <span
                    className={cx(
                      'cheese-dots h-16 w-16 rounded-full bg-photo',
                      isCommon ? 'border-2 border-border' : 'border-2 border-primary',
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="max-w-full truncate text-xs font-bold text-text">{s.name}</span>
                {/* 유사도 미계산(null) 인물은 %를 숨긴다 — 0%로 지어내지 않는다(CHMO-399) */}
                {isCommon ? (
                  <span className="text-[11px] text-muted">사진첩</span>
                ) : s.similarity !== null ? (
                  <span className="text-[11px] font-bold text-accent">
                    {Math.round(s.similarity * 100)}%
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
