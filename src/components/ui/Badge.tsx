import type { ReactNode } from 'react'
import type { EventStatus } from '../../types/api'
import { cx } from '../../lib/cx'

export type BadgeVariant =
  | 'new' // 이벤트: 사진 0장 신규
  | 'analyzing' // 이벤트: 사진 분류중
  | 'ready' // 이벤트: 공개 준비(검토완료)
  | 'published' // 이벤트: 공개 완료 (뷰어 '공개됨'은 children으로 라벨 교체)
  | 'reviewed' // 앨범: 검토완료 — 유일한 solid
  | 'unreviewed' // 앨범: 미검토

// 이벤트 상태는 틴트 배경(13~14%) + 동일 색 텍스트 + 도트 (dc.html §03)
const variantConfig: Record<BadgeVariant, { label: string; className: string; dot?: boolean }> = {
  new: { label: 'NEW', className: 'bg-status-empty/[.14] text-status-empty', dot: true },
  analyzing: {
    label: '분류중',
    className: 'bg-status-analyzing/[.13] text-status-analyzing',
    dot: true,
  },
  ready: { label: '공개 준비', className: 'bg-status-ready/[.13] text-status-ready', dot: true },
  published: {
    label: '공개 완료',
    className: 'bg-status-published/[.13] text-status-published',
    dot: true,
  },
  reviewed: { label: '검토완료', className: 'bg-accent text-white' },
  unreviewed: {
    label: '미검토',
    className: 'border border-dashed border-[#C9C2B4] bg-white text-muted',
  },
}

interface BadgeProps {
  variant: BadgeVariant
  /** sm = AlbumCard 안 축소형 (dc.html §06) */
  size?: 'md' | 'sm'
  /** 기본 라벨 교체(예: 뷰어의 '공개됨') */
  children?: ReactNode
}

export function Badge({ variant, size = 'md', children }: BadgeProps) {
  const { label, className, dot } = variantConfig[variant]
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-bold',
        size === 'md' ? 'gap-[5px] px-[11px] py-1.5 text-xs' : 'gap-1 px-2 py-1 text-[10px]',
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children ?? label}
    </span>
  )
}

interface CountBadgeProps {
  count: number
}

/**
 * '처리할 것이 N건' 표시 — 20 초대 화면의 탭별 대기 수(CHMO-502)와 05 [＋ 초대하기] 버튼(CHMO-520)이
 * 공유한다. 갈색 솔리드인 이유는 두 가지다: 안내용 빨간 글씨를 쓰지 않는다는 톤 규칙과, 옐로우 버튼
 * 안에 얹혀도 대비가 서는 색이 accent뿐이라는 것.
 *
 * 수만 알려주는 장식이라 aria-hidden이다 — 호출부가 버튼·탭에 전체 문장을 aria-label로 달아야 한다.
 */
export function CountBadge({ count }: CountBadgeProps) {
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
    >
      {count}
    </span>
  )
}

// EventStatus(types/api.ts) 1:1 매핑. 'review'(검수중)는 배지 정의 미확정이라 제외
// (screen-spec 05 배지 목록·tailwind.config.js TODO 참조 — 렌더하지 않는다).
const eventStatusVariant: Partial<Record<EventStatus, BadgeVariant>> = {
  empty: 'new',
  analyzing: 'analyzing',
  ready: 'ready',
  published: 'published',
}

interface EventStatusBadgeProps {
  status: EventStatus
  size?: 'md' | 'sm'
}

/** 이벤트 상태 배지 — 배지 정의가 없는 상태('review')는 아무것도 렌더하지 않는다 */
export function EventStatusBadge({ status, size }: EventStatusBadgeProps) {
  const variant = eventStatusVariant[status]
  if (!variant) return null
  return <Badge variant={variant} size={size} />
}
