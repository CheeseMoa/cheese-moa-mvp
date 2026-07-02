import type { ReactNode } from 'react'
import { Cheddar } from './Cheddar'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  /** CTA 영역(보통 primary Button) */
  action?: ReactNode
  /** 기본 체다 일러스트 교체용 */
  icon?: ReactNode
}

/**
 * 빈 상태 (dc.html §08): 체다 일러스트 + Jua 타이틀 + 본문 + CTA.
 * 상황별(빈 모임/빈 이벤트/빈 앨범/공개 이벤트 없음)로 문구만 교체해 쓴다.
 */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-8 py-11 text-center">
      {icon ?? <Cheddar size={76} className="opacity-[.85]" />}
      <h2 className="mt-4 font-display text-[21px] text-heading">{title}</h2>
      {description && <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
