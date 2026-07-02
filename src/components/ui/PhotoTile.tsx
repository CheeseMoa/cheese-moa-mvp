import { cx } from '../../lib/cx'

interface PhotoTileProps {
  /** 썸네일 URL — 없으면 치즈 도트 플레이스홀더(bg-photo) */
  src?: string
  alt?: string
  /** 선택 모드 — 미선택 타일에 빈 체크서클 노출 (dc.html §07) */
  selectable?: boolean
  selected?: boolean
  onClick?: () => void
}

/** 사진 타일 — 정사각·r12. 선택 = primary 3px 링 + 치즈 옐로우 체크. */
export function PhotoTile({ src, alt = '', selectable, selected, onClick }: PhotoTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'cheese-dots relative aspect-square w-full overflow-hidden rounded-xl bg-photo',
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
