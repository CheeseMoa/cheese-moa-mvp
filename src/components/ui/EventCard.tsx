import type { EventStatus } from '../../types/api'
import { EventStatusBadge } from './Badge'

interface EventCardProps {
  name: string
  status: EventStatus
  /** 메타 라인 — "날짜 · 사진 N장" 고정 포맷으로 페이지에서 조합 (dc.html §05) */
  meta: string
  /**
   * 커버 영역(CHMO-515) — **사진이 있는 이벤트만** 지정한다. 지정하지 않으면 커버 없는 컴팩트 카드가
   * 되고, 그 차이가 목록에서 "아직 사진이 없는 이벤트"를 그대로 드러낸다.
   * `url`이 null이면 치즈 도트 플레이스홀더 — 사진은 있는데 썸네일이 아직 안 온 구간
   * (등록 직후 분류중은 사진이 분석 커밋 시점에야 반영된다)과 투어 무대가 이 상태다.
   */
  cover?: { url: string | null }
  onClick?: () => void
  /** 지정하면 우측에 설정 ⚙ 노출 */
  onSettings?: () => void
}

/**
 * 모임 상세(05) 이벤트 카드. 제목 우측 상태 배지, 카드 탭 = 이동, ⚙ = 설정.
 *
 * 커버가 이 카드의 정체를 만든다(CHMO-515) — "모임이랑 이벤트가 구별 안 된다"는 피드백의 원인 하나가
 * 홈 모임 카드와 이 카드의 실루엣이 같다는 것이었다(흰 카드 + 제목 + 회색 메타 한 줄). 이벤트는
 * 사진 묶음이니 사진을 보여주고, 모임 쪽(색면 헤더 + 치즈 심볼)과 갈라진다.
 * (서체가 Jua 한 벌이라 font-bold는 시각 효과가 없다 — 제목·메타를 가르는 건 크기와 색이다, CHMO-513)
 */
export function EventCard({ name, status, meta, cover, onClick, onSettings }: EventCardProps) {
  return (
    <div
      onClick={onClick}
      className="w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-white shadow-card transition active:scale-[0.99]"
    >
      {cover && (
        <div className="cheese-dots h-32 w-full bg-photo">
          {cover.url && (
            <img
              src={cover.url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}
      <div className="p-4">
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
    </div>
  )
}
