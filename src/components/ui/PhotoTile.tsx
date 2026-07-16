import { useRef } from 'react'
import { cx } from '../../lib/cx'

interface PhotoTileProps {
  /** 썸네일 URL — 없으면 치즈 도트 플레이스홀더(bg-photo) */
  src?: string
  alt?: string
  /** 선택 모드 — 미선택 타일에 빈 체크서클 노출 (dc.html §07) */
  selectable?: boolean
  selected?: boolean
  onClick?: () => void
  /**
   * 롱프레스(꾹 누르기) — 모바일 사진 앱 관용 제스처(CHMO-243). 지정 시 길게 누르면 발화하고,
   * 뒤따르는 탭(onClick)은 무시된다(확대와 선택 진입이 겹치지 않게). 누른 채 손을 움직이면(스크롤) 취소.
   */
  onLongPress?: () => void
}

/** 롱프레스 판정: 이보다 오래 누르고 있으면 발화 · 이보다 손이 움직이면 스크롤로 보고 취소 */
const LONG_PRESS_MS = 450
const MOVE_TOLERANCE_PX = 10

/** 사진 타일 — 정사각·r12. 선택 = primary 3px 링 + 치즈 옐로우 체크. */
export function PhotoTile({
  src,
  alt = '',
  selectable,
  selected,
  onClick,
  onLongPress,
}: PhotoTileProps) {
  const timerRef = useRef<number | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  // 롱프레스가 발화하면 뒤따르는 click을 한 번 삼킨다(탭=확대와 겹침 방지)
  const firedRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onLongPress) return
    firedRef.current = false
    originRef.current = { x: e.clientX, y: e.clientY }
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (timerRef.current == null || !originRef.current) return
    const dx = e.clientX - originRef.current.x
    const dy = e.clientY - originRef.current.y
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clearTimer()
  }

  const handleClick = () => {
    if (firedRef.current) {
      firedRef.current = false
      return
    }
    onClick?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerMove={onLongPress ? handlePointerMove : undefined}
      onPointerUp={onLongPress ? clearTimer : undefined}
      onPointerCancel={onLongPress ? clearTimer : undefined}
      onPointerLeave={onLongPress ? clearTimer : undefined}
      // 롱프레스 시 iOS 이미지 저장 콜아웃/텍스트 선택 방지
      onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
      className={cx(
        'cheese-dots relative aspect-square w-full select-none overflow-hidden rounded-xl bg-photo',
        onLongPress && '[-webkit-touch-callout:none]',
        selected && 'border-[3px] border-primary',
      )}
    >
      {src && <img src={src} alt={alt} className="h-full w-full object-cover" />}
      {selected ? (
        <span className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-[13px] font-bold text-heading">
          ✓
        </span>
      ) : selectable ? (
        <span className="absolute right-1.5 top-1.5 h-[22px] w-[22px] rounded-full border-[1.5px] border-[#C9C2B4] bg-white/[.85]" />
      ) : null}
    </button>
  )
}
