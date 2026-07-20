import { useMemo, useRef } from 'react'
import type React from 'react'

/** 드래그 판정 최소 이동(px) — 이보다 작으면 클릭으로 본다 */
const DRAG_MIN = 6

/**
 * 가로 스크롤 목록을 데스크톱 마우스로 끌어서 넘기게 한다(CHMO-345).
 * 터치는 브라우저 네이티브 팬이 이미 담당하므로 mouse 포인터만 처리한다.
 * 드래그로 판정되면 이어지는 click을 캡처 단계에서 삼켜, 끌기 끝에
 * 목록 안 버튼이 눌리는 오작동을 막는다.
 * 사용: 스크롤 컨테이너에 `{...useDragScrollX()}` 스프레드(+ select-none 권장).
 */
export function useDragScrollX() {
  const state = useRef<{
    pointerId: number
    startX: number
    startLeft: number
    dragging: boolean
  } | null>(null)

  return useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return
        state.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startLeft: e.currentTarget.scrollLeft,
          dragging: false,
        }
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const s = state.current
        if (!s || s.pointerId !== e.pointerId) return
        const dx = e.clientX - s.startX
        if (!s.dragging) {
          if (Math.abs(dx) < DRAG_MIN) return
          s.dragging = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        e.currentTarget.scrollLeft = s.startLeft - dx
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const s = state.current
        // 드래그였다면 click이 곧 따라온다 — onClickCapture가 삼키고 정리한다
        if (s && s.pointerId === e.pointerId && !s.dragging) state.current = null
      },
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
        if (state.current?.pointerId === e.pointerId) state.current = null
      },
      onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
        if (!state.current?.dragging) return
        state.current = null
        e.preventDefault()
        e.stopPropagation()
      },
    }),
    [],
  )
}
