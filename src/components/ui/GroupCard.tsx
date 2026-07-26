import { Cheddar } from './Cheddar'

interface GroupCardProps {
  name: string
  /** 학부모 전환(CHMO-444) 후 PARENT·PENDING 목록 항목엔 멤버 수가 없다(§7-3 미노출) */
  memberCount?: number
  /** PENDING 항목엔 이벤트 수도 없다 — 없는 값을 0으로 그리면 빈 모임처럼 보인다 */
  eventCount?: number
  onClick?: () => void
}

/** 홈(02) 모임 카드 (dc.html §05). 관리자 배지·📌·설정 ⚙ 미표시 — 모임 설정은 상세(05) ⚙로 일원화(screen-spec 02 확정). */
export function GroupCard({ name, memberCount, eventCount, onClick }: GroupCardProps) {
  const counts = [
    memberCount !== undefined ? `멤버 ${memberCount}` : null,
    eventCount !== undefined ? `이벤트 ${eventCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-emblem">
        <Cheddar size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-text">{name}</span>
        {counts && <span className="mt-0.5 block text-xs text-muted">{counts}</span>}
      </span>
      <span className="text-lg text-[#C9C2B4]" aria-hidden="true">
        ›
      </span>
    </button>
  )
}
