import { eventStatusBadge } from '../lib/format'

/**
 * 이벤트 상태 배지(어드민/상태 배지 288:108) — 옅은 색 면 + 같은 색 글자.
 * Tailwind JIT가 클래스를 정적으로 봐야 해서 토큰 → 완성 클래스 문자열 맵으로 둔다.
 */
const BADGE_CLASSES: Record<string, string> = {
  empty: 'bg-admin-status-empty/15 text-admin-status-empty',
  analyzing: 'bg-admin-status-analyzing/15 text-admin-status-analyzing',
  review: 'bg-admin-status-review/15 text-admin-status-review',
  ready: 'bg-admin-status-ready/15 text-admin-status-ready',
  published: 'bg-admin-status-published/15 text-admin-status-published',
}

export function StatusBadge({ status }: { status: string }) {
  const { label, token } = eventStatusBadge(status)
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${
        BADGE_CLASSES[token] ?? BADGE_CLASSES.empty
      }`}
    >
      {label}
    </span>
  )
}
