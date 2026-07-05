import { Cheddar } from './Cheddar'

interface GroupCardProps {
  name: string
  memberCount: number
  eventCount: number
  onClick?: () => void
}

/** 홈(02) 모임 카드 (dc.html §05). 관리자 배지·📌·설정 ⚙ 미표시 — 모임 설정은 상세(05) ⚙로 일원화(screen-spec 02 확정). */
export function GroupCard({ name, memberCount, eventCount, onClick }: GroupCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-primary">
        <Cheddar size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-text">{name}</span>
        <span className="mt-0.5 block text-xs text-muted">
          멤버 {memberCount} · 이벤트 {eventCount}
        </span>
      </span>
      <span className="text-lg text-[#C9C2B4]" aria-hidden="true">
        ›
      </span>
    </button>
  )
}
