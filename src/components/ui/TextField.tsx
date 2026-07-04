import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** 필드 하단 에러 메시지 — 있으면 테두리도 warn 컬러 */
  error?: string | null
}

/**
 * 라벨 + 입력 필드 공용 컴포넌트 (와이어프레임 243:33 폼 스타일).
 * 표면은 surface, 포커스 시 primary 테두리. 에러는 warn 테두리 + 하단 메시지.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, id, className, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-bold text-text">
        {label}
      </label>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx(
          'h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/25',
          error ? 'border-warn' : 'border-border focus:border-primary',
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-warn">
          {error}
        </p>
      ) : null}
    </div>
  )
})
