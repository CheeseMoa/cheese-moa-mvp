/** 조건부 클래스 결합 — falsy 값은 걸러낸다 */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
