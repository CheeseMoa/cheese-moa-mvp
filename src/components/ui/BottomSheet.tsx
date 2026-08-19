import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useOverlayTransition } from '../../hooks/useOverlayTransition'
import { cx } from '../../lib/cx'
import { MOTION_DURATION, MOTION_EASE } from '../../lib/motion'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  /**
   * 본문이 프레임보다 길어질 수 있는 시트(앨범 설정의 학부모 명단 등) — children을 세로 스크롤
   * 영역에 담고, 그 안에서 시작한 제스처는 브라우저 스크롤에 양보한다(끌어내려 닫기는 그랩 핸들·
   * 제목 영역이 맡는다). 세로 팬을 JS가 가져가는 기본 동작(touch-action: pan-x)으로는 시트 안
   * 세로 스크롤이 아예 불가능하다 — 조상의 pan-x가 자손의 세로 스크롤까지 막는다.
   * 기본(false)은 종전 동작 그대로: 시트 어디를 끌어도 닫히고 내부 가로 스크롤만 공존한다.
   */
  bodyScrollable?: boolean
  /**
   * 프레임을 거의 다 먹는 시트(03 유형 선택) — 콘텐츠 높이가 아니라 프레임 높이에서 상단
   * 인셋만 뺀 만큼을 차지한다. 화면 자체가 시트인 화면용: 위로 남긴 56px에 어두워진 뒤
   * 배경이 비쳐 "덮은 화면"이 보이고, 본문은 flex-1이라 카드를 세로 중앙에 놓을 수 있다.
   * 제목도 이땐 화면 제목급(20px)으로 키운다 — 목록형 시트의 16px은 전체화면에서 눌린다.
   */
  fullHeight?: boolean
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
 * 열림·닫힘 모두 전환을 탄다(CHMO-711) — 아래에서 올라오고 아래로 내려간다(끌어내려 닫는
 * 제스처와 같은 축). 끌어서 닫을 때만 예외로 퇴장 애니메이션을 쓰지 않는다: 손이 이미
 * 시트를 내려놓은 자리에서 키프레임(translateY 0 → 100%)이 시작하면 시트가 위로 튄다.
 * 그땐 끌던 위치에서 이어 내려가도록 인라인 transform에 맡긴다.
 *
 * 끌어내려 닫기(CHMO-345): 포인터 이벤트라 터치·마우스 모두 동작한다. 첫 이동의
 * 지배 축이 수직일 때만 시트를 끌고, 수평이면 내부 가로 스크롤(09-1 추천 목록)에
 * 양보한다 — touch-action: pan-x가 터치의 가로 네이티브 팬은 살리고 수직만 JS로
 * 넘겨준다. 수직 드래그로 판정되면 이어지는 click을 캡처 단계에서 삼켜, 끌기 끝에
 * 시트 안 버튼·스크림이 눌리는 오작동을 막는다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  bodyScrollable = false,
  fullHeight = false,
  children,
}: BottomSheetProps) {
  useEscapeKey(open, onClose)
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const { mounted, leaving } = useOverlayTransition(open)
  /** 끌어내려 닫는 중인가 — 퇴장을 키프레임이 아니라 손이 놓은 자리에서 이어 간다 */
  const [dragClosing, setDragClosing] = useState(false)
  /** 끌어 닫은 직후 "정말 닫혔는지"를 이벤트 핸들러 밖에서 확인하기 위한 최신 open */
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
    if (open) setDragClosing(false)
  }, [open])

  if (!mounted) return null

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 멀티터치 두 번째 포인터가 진행 중인 드래그 상태를 덮어쓰지 않게 무시
    if (drag.current) return
    // 스크롤 본문에서 시작한 제스처는 스크롤에 양보 — 시트를 끄는 건 핸들·제목 영역뿐이다
    if (bodyScrollable && (e.target as Element | null)?.closest?.('[data-sheet-body]')) return
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
    const closing = e.type !== 'pointercancel' && (d.dy > CLOSE_DRAG_MIN || flick)
    const el = sheetRef.current
    if (closing) {
      // 손이 놓은 자리에서 그대로 화면 밖까지 — 퇴장 애니메이션은 이 경우만 건너뛴다
      setDragClosing(true)
      if (el) {
        el.style.transition = `transform ${MOTION_DURATION.fast}ms ${MOTION_EASE.exit}`
        el.style.transform = 'translateY(100%)'
      }
      onClose()
      // 닫힘은 거부될 수 있다(이동 중 busy 등) — 그대로 두면 시트가 화면 밖에 남는다.
      // 다음 틱(리렌더 후)에도 열려 있으면 되돌린다.
      window.setTimeout(() => {
        const still = sheetRef.current
        if (!openRef.current || !still) return
        setDragClosing(false)
        still.style.transition = `transform ${MOTION_DURATION.base}ms ${MOTION_EASE.standard}`
        still.style.transform = 'translateY(0px)'
      }, 0)
      return
    }
    // 닫히지 않았으면(짧은 끌기, 또는 닫힘이 거부될 수 있는 busy 상황) 원위치로 되돌린다
    if (el) {
      el.style.transition = `transform ${MOTION_DURATION.base}ms ${MOTION_EASE.standard}`
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
      className={cx(
        'absolute inset-0 z-40 bg-text/[.45]',
        // 퇴장 중엔 입력을 받지 않는다 — 이미 닫힌 시트가 탭을 한 번 더 삼키면 안 된다
        leaving ? 'pointer-events-none animate-scrim-out' : 'animate-scrim-in',
      )}
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
          /* 스크롤 본문 시트는 세로 팬을 브라우저에 남긴다 — pan-x면 자손 스크롤까지 막힌다 */
          style={{ touchAction: bodyScrollable ? undefined : 'pan-x' }}
          className={cx(
            'select-none rounded-t-[24px] bg-cream px-5 pb-safe-6 pt-3',
            !dragClosing && (leaving ? 'animate-sheet-out' : 'animate-sheet-in'),
            // 상단 56px은 스크림에 남긴다 — 어두워진 뒤 배경이 그만큼 비쳐 깊이가 생긴다
            fullHeight && 'flex h-[calc(100%-56px)] flex-col',
          )}
        >
          <div className="mx-auto h-1 w-11 rounded-full bg-border" aria-hidden="true" />
          {title &&
            (fullHeight ? (
              <h2 className="mt-5 text-[20px] text-heading">{title}</h2>
            ) : (
              <h2 className="mt-4 text-base font-bold text-text">{title}</h2>
            ))}
          {subtitle && (
            <p className={cx('text-muted', fullHeight ? 'mt-2 text-[13px]' : 'mt-1 text-xs')}>
              {subtitle}
            </p>
          )}
          <div
            data-sheet-body={bodyScrollable ? '' : undefined}
            className={cx(
              'mt-2',
              // 프레임을 넘기지 않게 본문만 스크롤 — 핸들·제목은 위에 남아 끌어내려 닫기가 살아 있다
              bodyScrollable && 'max-h-[68dvh] overflow-y-auto overscroll-contain',
              // min-h-0이 없으면 flex 자식이 콘텐츠 높이 아래로 안 줄어 세로 중앙 정렬이 깨진다
              fullHeight && 'min-h-0 flex-1',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
