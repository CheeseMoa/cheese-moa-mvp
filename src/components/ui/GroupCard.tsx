import { cx } from '../../lib/cx'
import type { GroupType } from '../../types/api'
import { Cheddar } from './Cheddar'

interface GroupCardProps {
  name: string
  /** 유형 분기(CHMO-608) — business만 '비즈니스' 배지·관리자/멤버 분리 카운트. 일반은 무표기(기본값) */
  groupType?: GroupType
  /** 학부모 전환(CHMO-444) 후 VIEWER·PENDING 목록 항목엔 멤버 수가 없다(§7-3 미노출) */
  memberCount?: number
  /** 비즈니스 분리 카운트(CHMO-605 — editorCount/viewerCount). 없으면 memberCount 폴백 */
  editorCount?: number
  viewerCount?: number
  /** PENDING 항목엔 이벤트 수도 없다 — 없는 값을 0으로 그리면 빈 모임처럼 보인다 */
  eventCount?: number
  /** 카운트 줄을 대체하는 멤버십 서브텍스트 — "멤버 · 참여 중"·"신청: 김민준"(CHMO-445) */
  subtitle?: string
  /** 승인 대기(PENDING) — 뮤트 + "승인 대기중" 배지, 이동 화살표 숨김. 탭은 토스트(§7-2) */
  pending?: boolean
  onClick?: () => void
}

/**
 * 홈(02) 모임 카드 (dc.html §05 · B2C 360:12/16/22).
 * 관리자 배지·📌·설정 ⚙ 미표시 — 모임 설정은 상세(05) ⚙로 일원화(screen-spec 02 확정).
 * 배지는 이름 뒤 인라인(와이어프레임 — 대기 배지도 CHMO-608에서 우측 끝 → 인라인 이동):
 * 대기는 전부 비즈니스(일반은 즉시 합류)라 두 배지가 겹칠 땐 '승인 대기중'만 남긴다.
 */
export function GroupCard({
  name,
  groupType,
  memberCount,
  editorCount,
  viewerCount,
  eventCount,
  subtitle,
  pending,
  onClick,
}: GroupCardProps) {
  const business = groupType === 'business'
  // 카운트 줄(B2C 360:15·21) — 이벤트 먼저: 일반 "이벤트 3개 · 멤버 6" /
  // 비즈니스 "이벤트 8개 · 관리자 3 · 멤버 12". 분리 카운트가 없는 구계약 비즈니스 응답은
  // 05와 같은 '인원 N명' 폴백(CHMO-530 — memberCount는 관리자 포함 총원이라 '멤버'로 못 부른다)
  const splitCounts = business && editorCount !== undefined && viewerCount !== undefined
  const counts = [
    eventCount !== undefined ? `이벤트 ${eventCount}개` : null,
    splitCounts ? `관리자 ${editorCount} · 멤버 ${viewerCount}` : null,
    !splitCounts && memberCount !== undefined
      ? business
        ? `인원 ${memberCount}명`
        : `멤버 ${memberCount}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
  // 승인 대기 항목은 카운트로 폴백하지 않는다 — 실 BE는 memberCount를 생략하면서 eventCount는
  // 0으로 실어 주는데(CHMO-475), 그대로 그리면 "이벤트 0"이 빈 모임처럼 읽힌다.
  const sub = subtitle ?? (pending ? undefined : counts || undefined)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      {/* 갈색 타일 없이 심볼만 — 슬롯 크기(44)는 유지해 목록 정렬이 흔들리지 않게 한다 */}
      <span
        className={cx(
          'flex h-11 w-11 shrink-0 items-center justify-center',
          pending && 'opacity-50',
        )}
      >
        <Cheddar size={40} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cx(
              'min-w-0 truncate text-base font-bold',
              pending ? 'text-muted' : 'text-text',
            )}
          >
            {name}
          </span>
          {pending ? (
            <span className="shrink-0 rounded-full bg-black/[.06] px-2.5 py-1 text-[11px] font-bold text-muted">
              승인 대기중
            </span>
          ) : business ? (
            // 03 유형 pill과 같은 처방(CHMO-603) — 일반 모임은 기본값이라 무표기(Q5)
            <span className="shrink-0 rounded-full bg-primary/20 px-2.5 py-1 text-[11px] font-bold text-heading">
              비즈니스
            </span>
          ) : null}
        </span>
        {sub && <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>}
      </span>
      {!pending && (
        <span className="text-lg text-[#C9C2B4]" aria-hidden="true">
          ›
        </span>
      )}
    </button>
  )
}
