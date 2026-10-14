/**
 * 어드민 입력칸 클래스 (CHMO-928) — 폼 부품(components/AdminForm)과 같은 결이지만 컴포넌트 파일에서
 * 문자열 함수를 내보내면 Fast Refresh가 끊겨 따로 둔다.
 */

/** 한 줄 입력 — 오류가 있으면 보더만 붉게(문구는 Field가 아래에 단다) */
export function inputClassName(invalid?: boolean): string {
  return `h-10 w-full rounded-lg border bg-admin-surface px-3 text-[14px] text-admin-text placeholder:text-admin-muted/70 focus:outline-none disabled:opacity-60 ${
    invalid ? 'border-warn focus:border-warn' : 'border-admin-border focus:border-primary'
  }`
}

export function textareaClassName(invalid?: boolean): string {
  return `w-full resize-y rounded-lg border bg-admin-surface px-3 py-2.5 text-[14px] leading-relaxed text-admin-text placeholder:text-admin-muted/70 focus:outline-none disabled:opacity-60 ${
    invalid ? 'border-warn focus:border-warn' : 'border-admin-border focus:border-primary'
  }`
}
