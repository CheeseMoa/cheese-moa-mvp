import type { EventStatus } from '../../types/api'
import { EventStatusBadge } from './Badge'

interface EventCardProps {
  name: string
  status: EventStatus
  /** 메타 라인 — "날짜 · 사진 N장 · 인원" 고정 포맷으로 페이지에서 조합 (dc.html §05) */
  meta: string
  onClick?: () => void
  /** 지정하면 우측에 설정 ⚙ 노출 */
  onSettings?: () => void
}

/** 모임 상세(05) 이벤트 카드. 제목 우측 상태 배지, 카드 탭 = 이동, ⚙ = 설정. */
export function EventCard({ name, status, meta, onClick, onSettings }: EventCardProps) {
  return (
    <div
      onClick={onClick}
      className="w-full cursor-pointer rounded-2xl border border-border bg-white p-4 shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-2.5">
        <span className="min-w-0 truncate text-base font-bold text-text">{name}</span>
        <EventStatusBadge status={status} />
        {onSettings && (
          <button
            type="button"
            aria-label="이벤트 설정"
            onClick={(e) => {
              e.stopPropagation()
              onSettings()
            }}
            className="ml-auto text-base text-muted"
          >
            ⚙
          </button>
        )}
      </div>
      <p className="mt-[7px] text-xs text-muted">{meta}</p>
    </div>
  )
}
