/**
 * 어드민 표시 포맷·표시명 단일 원천 (CHMO-379).
 * 값이 비면 전부 '—'로 수렴한다 — 표에서 빈 칸은 "안 불렀나"로 읽히고 대시는 "없다"로 읽힌다.
 */
import type { AdminMemberRole, AdminMemberStatus } from '../api/types'

/** 천 단위 구분(1,284) — 어드민 숫자 표기 공통 */
export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR')
}

/** ISO 시각/날짜 → KST 날짜(YYYY-MM-DD). eventDate 같은 날짜 문자열도 그대로 받는다 */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  // sv-SE 로케일이 ISO 형태(YYYY-MM-DD)를 낸다 — 수동 조립보다 타임존 처리가 안전
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

/** ISO 시각 → KST 날짜+시각(YYYY-MM-DD HH:mm) — 대시보드 '마지막 갱신' 등 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const time = date.toLocaleTimeString('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${day} ${time}`
}

// ── BE enum 표시명 — 어드민은 BE 상태를 그대로 보여준다(서비스 화면 파생과 별개) ──

/** BE MomentStatus → 배지 라벨·색 토큰 키(tailwind admin.status.*) */
const EVENT_STATUS_BADGES: Record<string, { label: string; token: string }> = {
  EMPTY: { label: '빈 이벤트', token: 'empty' },
  ANALYZING: { label: '분석중', token: 'analyzing' },
  REVIEW: { label: '검수중', token: 'review' },
  READY: { label: '공개 준비', token: 'ready' },
  PUBLISHED: { label: '공개', token: 'published' },
}

/** 미지의 상태는 원문 그대로 중립 표기 — BE에 상태가 늘어도 화면이 깨지지 않는다 */
export function eventStatusBadge(status: string): { label: string; token: string } {
  return EVENT_STATUS_BADGES[status] ?? { label: status, token: 'empty' }
}

export function memberRoleLabel(role: AdminMemberRole): string {
  if (role === 'TEACHER') return '선생님'
  if (role === 'PARENT') return '학부모'
  return role
}

export function memberStatusLabel(status: AdminMemberStatus): string {
  if (status === 'ACTIVE') return '참여 중'
  if (status === 'PENDING') return '승인 대기'
  return status
}
