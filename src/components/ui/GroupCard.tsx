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
  // 승인 대기 항목은 카운트로 폴백하지 않는다 — 실 BE는 memberCount를 생략하면서 eventCount는
  // 0으로 실어 주는데(CHMO-475), 그대로 그리면 "이벤트 0"이 빈 모임처럼 읽힌다.
  // 선생님 신청은 자녀 이름조차 없어(childNames 빈 배열) subtitle 없이 여기로 새기 쉽다.
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
