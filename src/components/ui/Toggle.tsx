import { cx } from '../../lib/cx'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** 우측 라벨 — OFF일 때 muted 처리 (dc.html §04) */
  label?: string
  disabled?: boolean
}

/** 스위치 토글 48×28 — ON=primary · OFF=border, 흰색 노브 */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 disabled:opacity-50"
    >
      <span
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span
          className={cx(
            'absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-[left]',
            checked ? 'left-[23px]' : 'left-[3px]',
          )}
        />
      </span>
      {label && (
        <span className={cx('text-[13px] font-medium', checked ? 'text-text' : 'text-muted')}>
          {label}
        </span>
      )}
    </button>
  )
}
