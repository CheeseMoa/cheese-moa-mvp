/**
 * 4자리 PIN 규칙 단일 원천 — UI(PinField·검증)와 목 핸들러가 공유한다.
 * 정책이 바뀌면(예: 6자리) 여기 한 곳만 수정.
 */
export const PIN_RE = /^\d{4}$/

/** 입력 문자열에서 숫자만 남기고 4자리로 자른다 (PIN 입력 필드 공용) */
export function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4)
}
