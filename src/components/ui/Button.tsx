import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

type ButtonVariant = 'primary' | 'secondary' | 'warn'
type ButtonSize = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** md = 기본 h48·r14 · sm = 소형 h36·r10 (dc.html §02) */
  size?: ButtonSize
  /** 하단 고정 CTA 등 가로 꽉 채움 */
  fullWidth?: boolean
}

/**
 * 공용 버튼. 치즈 옐로우 위 흰 글자 금지(대비) — primary는 text 컬러, warn만 흰 글자 (dc.html ③).
 * disabled는 variant와 무관하게 surface+muted.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const sizeCls =
    size === 'md' ? 'h-12 rounded-[14px] px-5 text-[15px]' : 'h-9 rounded-[10px] px-4 text-[13px]'
  const variantCls = disabled
    ? 'bg-surface text-muted'
    : variant === 'primary'
      ? size === 'md'
        ? 'bg-gradient-cheddar text-text shadow-card'
        : 'bg-gradient-primary text-text'
      : variant === 'secondary'
        ? 'border border-border bg-surface text-text'
        : 'bg-warn text-white'
  return (
    <button
      type={type}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center font-bold transition active:scale-[0.99] disabled:active:scale-100',
        sizeCls,
        variantCls,
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
