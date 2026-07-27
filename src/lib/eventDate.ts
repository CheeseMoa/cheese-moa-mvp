/**
 * 이벤트 카드 날짜 표기 단일 원천(CHMO-448) — 05·15-L·18이 공유한다.
 * 원래 두 화면에 같은 함수가 중복 정의돼 있었는데 세 번째 소비처가 생겨 승격했다.
 */

/** "2026-06-15" → "6월 15일" (이벤트 카드 메타) — YYYY-MM-DD가 아니면 원문 그대로 */
export function formatEventDate(date: string): string {
  const [, month = '', day = ''] = date.split('-')
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  if (!Number.isFinite(m) || !Number.isFinite(d)) return date
  return `${m}월 ${d}일`
}
