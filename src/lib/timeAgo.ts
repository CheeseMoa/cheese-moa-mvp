/**
 * 상대 시각 표기 단일 원천(CHMO-447) — 20 초대 관리의 신청 시각("방금 전"·"2시간 전").
 * 7일이 넘으면 상대 표기가 오히려 모호해 날짜("M월 D일")로 내려간다.
 * 미래 시각(서버·클라이언트 시계 오차)은 "방금 전"으로 수렴 — 음수 표기를 만들지 않는다.
 */
export function formatTimeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return `${then.getMonth() + 1}월 ${then.getDate()}일`
}
