import { Link } from 'react-router-dom'
import { formatCount } from '../lib/format'

interface StatCardProps {
  label: string
  /** 아직 모르는 값은 null — 0으로 채우면 "없다"는 거짓말이 된다(어드민 '—' 규칙) */
  value: number | null
  /** 단위(명·개·장·건) — 숫자 곁에 작게 */
  unit: string
  /** 있으면 카드 전체가 그 화면으로 가는 링크(처리할 일 카드 — CHMO-811) */
  to?: string
}

/** 지표 카드(어드민/지표 카드 288:92) — 라벨 위·큰 숫자 아래 */
export function StatCard({ label, value, unit, to }: StatCardProps) {
  const body = (
    <>
      <div className="text-[13px] text-admin-muted">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[26px] font-bold leading-none tracking-tight">
          {value === null ? '—' : formatCount(value)}
        </span>
        {value === null ? null : <span className="text-[13px] text-admin-muted">{unit}</span>}
      </div>
    </>
  )
  const className = 'rounded-xl border border-admin-border bg-admin-surface px-5 py-4'
  if (to) {
    return (
      <Link to={to} className={`${className} block hover:border-primary hover:bg-admin-nav`}>
        {body}
      </Link>
    )
  }
  return <div className={className}>{body}</div>
}
