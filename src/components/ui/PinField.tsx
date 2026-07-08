import { sanitizePinInput } from '../../lib/pin'
import { TextField } from './TextField'

interface PinFieldProps {
  label: string
  placeholder?: string
  /** 로그인 current-password · 가입/변경 new-password (기본 off) */
  autoComplete?: string
  value: string
  /** 숫자만·4자리로 정제된 값이 온다 */
  onChange: (pin: string) => void
  disabled?: boolean
}

/**
 * 4자리 PIN 입력 공용 필드 (CHMO-118) — 01-1/01-2 인증·뷰어 잠금 해제·설정 PIN 변경에서 재사용.
 * maxLength는 붙여넣기를 필터보다 먼저 잘라 PIN을 훼손하므로 쓰지 않는다 — sanitizePinInput으로 자름.
 */
export function PinField({ label, placeholder, autoComplete = 'off', value, onChange, disabled }: PinFieldProps) {
  return (
    <TextField
      label={label}
      placeholder={placeholder}
      type="password"
      inputMode="numeric"
      autoComplete={autoComplete}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(sanitizePinInput(e.target.value))}
    />
  )
}
