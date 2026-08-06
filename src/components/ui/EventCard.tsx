import type { EventStatus, GroupType } from '../../types/api'
import { EventStatusBadge } from './Badge'

interface EventCardProps {
  name: string
  status: EventStatus
  /**
   * 모임 유형(CHMO-609) — `general`이면 검수 문맥 배지(NEW·공개 준비·공개 완료)를 걷어내고
   * '분류중'만 남긴다: 일반 모임엔 검수·공개 단계가 없어 그 상태들이 정보가 아니고, 분류중만이
   * "아직 앨범이 덜 채워졌다"는 지금 유효한 사실이다. 생략 시 현행(비즈니스와 동일).
   */
  groupType?: GroupType
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
 *
 * **카드끼리도 갈라져야 한다(CHMO-532)** — 여럿을 쌓으면 어디서 끊기는지가 흐렸다. 원인은 취향이
 * 아니라 색 수치였다: 카드 면(흰색)과 페이지 배경(cream)은 명도차가 1%도 안 돼 사실상 같은 색이라
 * 경계가 전부 테두리·그림자 몫인데, 그 테두리는 1px `border`(배경 대비 ~10%)로 옅고 그림자는
 * blur 30이라 카드 사이 간격을 뿌옇게 채우고 있었다. 그래서 **경계는 진한 테두리(1.5px)가 맡고,
 * 그림자는 카드를 띄우는 몫만**(`shadow-card-stack`) 남긴다 — 그림자를 아예 버리면 홈·앨범·시트에
 * 두루 깔린 "카드는 떠 있다"는 결과 어긋나 05만 평평해진다.
 */
export function EventCard({
  name,
  status,
  groupType,
  meta,
  cover,
  onClick,
  onSettings,
}: EventCardProps) {
  return (
    <div
      onClick={onClick}
      // 테두리 색은 border(#E6E0D4)보다 한 단계 진한 라인 — 팔레트에 중간 톤 라인 색이 없어
      // 임의값이다(다른 카드도 같은 처방을 하게 되면 토큰으로 올린다)
      className="w-full cursor-pointer overflow-hidden rounded-[18px] border-[1.5px] border-[#D8CFBB] bg-white shadow-card-stack transition active:scale-[0.99]"
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
          {(groupType !== 'general' || status === 'analyzing') && (
            <EventStatusBadge status={status} />
          )}
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
