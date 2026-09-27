import {
  eventStatusBadge,
  inquiryStatusBadge,
  reportStatusBadge,
  reportTypeBadge,
} from '../lib/format'

/**
 * 상태 배지(어드민/상태 배지 288:108) — 옅은 색 면 + 같은 색 글자.
 * Tailwind JIT가 클래스를 정적으로 봐야 해서 토큰 → 완성 클래스 문자열 맵으로 둔다.
 * 문의 배지(CHMO-811)도 같은 토큰을 다시 쓴다 — 색을 늘리지 않는 이유는 lib/format 주석 참조.
 */
const BADGE_CLASSES: Record<string, string> = {
  empty: 'bg-admin-status-empty/15 text-admin-status-empty',
  analyzing: 'bg-admin-status-analyzing/15 text-admin-status-analyzing',
  review: 'bg-admin-status-review/15 text-admin-status-review',
  ready: 'bg-admin-status-ready/15 text-admin-status-ready',
  published: 'bg-admin-status-published/15 text-admin-status-published',
  // 신고 2종 유형 배지(CHMO-862) — 목록에서 먼저 눈에 걸려야 하는 유일한 붉은 배지. 서비스
  // `warn`(삭제 등 위험)과 같은 색을 쓴다: 어드민 팔레트에 붉은 계열이 따로 없고, 뜻도 같다
  report: 'bg-warn/10 text-warn',
}

function Badge({ label, token }: { label: string; token: string }) {
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

/** 이벤트 상태(BE MomentStatus) */
export function StatusBadge({ status }: { status: string }) {
  return <Badge {...eventStatusBadge(status)} />
}

/** 기관 문의 상태(BE OrganizationInquiryStatus — CHMO-811) */
export function InquiryStatusBadge({ status }: { status: string }) {
  return <Badge {...inquiryStatusBadge(status)} />
}

/** 신고·문의 상태(BE ReportStatus — CHMO-862) */
export function ReportStatusBadge({ status }: { status: string }) {
  return <Badge {...reportStatusBadge(status)} />
}

/** 신고·문의 유형(BE ReportType — CHMO-862). 신고 2종만 붉은색 */
export function ReportTypeBadge({ type }: { type: string }) {
  return <Badge {...reportTypeBadge(type)} />
}
