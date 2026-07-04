import type { ButtonHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { cx } from '../../lib/cx'

type ButtonVariant = 'primary' | 'secondary' | 'warn'
type ButtonSize = 'md' | 'sm'

interface ButtonStyleOptions {
  variant: ButtonVariant
  size: ButtonSize
  fullWidth?: boolean
  disabled?: boolean
  className?: string
}

/** Button/ButtonLink 공용 클래스 계산 (dc.html §02) */
function buttonClasses({ variant, size, fullWidth, disabled, className }: ButtonStyleOptions) {
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
  return cx(
    'inline-flex items-center justify-center font-bold transition active:scale-[0.99] disabled:active:scale-100',
    sizeCls,
    variantCls,
    fullWidth && 'w-full',
    className,
  )
}

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
  return (
    <button
      type={type}
      disabled={disabled}
      className={buttonClasses({ variant, size, fullWidth, disabled, className })}
      {...rest}
    >
      {children}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

/**
 * 버튼처럼 보이는 내비게이션 링크 — 순수 화면 이동은 button 대신 앵커 시맨틱
 * (새 탭 열기·접근성). 시각 스타일은 Button과 동일.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </Link>
  )
}
