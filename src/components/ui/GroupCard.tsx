import { cx } from '../../lib/cx'
import { Cheddar } from './Cheddar'

interface GroupCardProps {
  name: string
  /** 학부모 전환(CHMO-444) 후 PARENT·PENDING 목록 항목엔 멤버 수가 없다(§7-3 미노출) */
  memberCount?: number
  /** PENDING 항목엔 이벤트 수도 없다 — 없는 값을 0으로 그리면 빈 모임처럼 보인다 */
  eventCount?: number
  /** 카운트 줄을 대체하는 멤버십 서브텍스트 — "학부모 · 참여 중"·"신청: 김민준"(CHMO-445) */
  subtitle?: string
  /** 승인 대기(PENDING) — 뮤트 + "승인 대기중" 배지, 이동 화살표 숨김. 탭은 토스트(§7-2) */
  pending?: boolean
  onClick?: () => void
}

/**
 * 홈(02) 모임 카드 (dc.html §05 · 대기 상태는 node 337:4).
 * 관리자 배지·📌·설정 ⚙ 미표시 — 모임 설정은 상세(05) ⚙로 일원화(screen-spec 02 확정).
 */
export function GroupCard({
  name,
  memberCount,
  eventCount,
  subtitle,
  pending,
  onClick,
}: GroupCardProps) {
  const counts = [
    memberCount !== undefined ? `멤버 ${memberCount}` : null,
    eventCount !== undefined ? `이벤트 ${eventCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const sub = subtitle ?? (counts || undefined)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <span
        className={cx(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-emblem',
          pending && 'opacity-50',
        )}
      >
        <Cheddar size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cx('block truncate text-base font-bold', pending ? 'text-muted' : 'text-text')}
        >
          {name}
        </span>
        {sub && <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>}
      </span>
      {pending ? (
        <span className="shrink-0 rounded-full bg-black/[.06] px-2.5 py-1 text-[11px] font-bold text-muted">
          승인 대기중
        </span>
      ) : (
        <span className="text-lg text-[#C9C2B4]" aria-hidden="true">
          ›
        </span>
      )}
    </button>
  )
}
