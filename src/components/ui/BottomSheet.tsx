import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useEscapeKey } from '../../hooks/useEscapeKey'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
}

/** 축 판별 최소 이동(px) — 이보다 작으면 탭으로 본다 */
const AXIS_LOCK_MIN = 8
/** 이만큼 끌어내리면 놓았을 때 닫는다(px) */
const CLOSE_DRAG_MIN = 80
/** 플릭 속도(px/ms) — 짧게 끌어도 아래로 빠르게 튕기면 닫는다 */
const CLOSE_FLICK_SPEED = 0.5

interface DragState {
  pointerId: number
  startX: number
  startY: number
  /** none = 축 미판별(탭일 수 있음) · v = 시트 끌기 · h = 내부 가로 스크롤에 양보 */
  axis: 'none' | 'v' | 'h'
  /** 아래로 끌어내린 거리(위로는 0 클램프) */
  dy: number
  lastY: number
  lastT: number
  /** 직전 구간 속도(px/ms, 아래가 양수) — 플릭 판정용 */
  speed: number
}

/**
 * 하단 시트 (dc.html §10) — 상단 r24 + 그랩 핸들, 목록형 액션(사진 이동 09-1 등)용.
 * PhoneShell(relative) 내부에서 렌더해 프레임 안쪽만 덮는다.
 * 긴 화면에서 프레임이 뷰포트보다 자라도 시트가 화면 밖(프레임 맨 아래)에 열리지 않게,
 * 스크림 안 sticky 컨테이너(h-dvh, 프레임이 더 짧으면 max-h-full)로 현재 뷰포트 하단에 붙인다.
 *
 * 끌어내려 닫기(CHMO-345): 포인터 이벤트라 터치·마우스 모두 동작한다. 첫 이동의
 * 지배 축이 수직일 때만 시트를 끌고, 수평이면 내부 가로 스크롤(09-1 추천 목록)에
 * 양보한다 — touch-action: pan-x가 터치의 가로 네이티브 팬은 살리고 수직만 JS로
 * 넘겨준다. 수직 드래그로 판정되면 이어지는 click을 캡처 단계에서 삼켜, 끌기 끝에
 * 시트 안 버튼·스크림이 눌리는 오작동을 막는다.
 */
export function BottomSheet({ open, onClose, title, subtitle, children }: BottomSheetProps) {
  useEscapeKey(open, onClose)
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)

  if (!open) return null

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 멀티터치 두 번째 포인터가 진행 중인 드래그 상태를 덮어쓰지 않게 무시
    if (drag.current) return
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      axis: 'none',
      dy: 0,
      lastY: e.clientY,
      lastT: e.timeStamp,
      speed: 0,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dyRaw = e.clientY - d.startY
    if (d.axis === 'none') {
      if (Math.max(Math.abs(dx), Math.abs(dyRaw)) < AXIS_LOCK_MIN) return
      d.axis = Math.abs(dyRaw) > Math.abs(dx) ? 'v' : 'h'
      if (d.axis === 'v') {
        e.currentTarget.setPointerCapture(e.pointerId)
        suppressClick.current = true
      }
    }
    if (d.axis !== 'v') return
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.speed = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    d.dy = Math.max(0, dyRaw)
    const el = sheetRef.current
    if (el) {
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.dy}px)`
    }
  }

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    if (d.axis !== 'v') return
    const flick = d.dy > AXIS_LOCK_MIN && d.speed > CLOSE_FLICK_SPEED
    if (e.type !== 'pointercancel' && (d.dy > CLOSE_DRAG_MIN || flick)) onClose()
    // 닫힘이 거부될 수 있어(이동 중 busy 등) 항상 원위치로 되돌린다
    const el = sheetRef.current
    if (el) {
      el.style.transition = 'transform 200ms ease'
      el.style.transform = 'translateY(0px)'
    }
  }

  const handleClickCapture = (e: React.MouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      onClick={onClose}
      onClickCapture={handleClickCapture}
      className="absolute inset-0 z-40 bg-text/[.45]"
    >
      <div className="sticky top-0 flex h-dvh max-h-full flex-col justify-end">
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{ touchAction: 'pan-x' }}
          className="select-none rounded-t-[24px] bg-cream px-5 pb-6 pt-3"
        >
          <div className="mx-auto h-1 w-11 rounded-full bg-border" aria-hidden="true" />
          {title && <h2 className="mt-4 text-base font-bold text-text">{title}</h2>}
          {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  )
}
