import { formatCount } from '../lib/format'

interface StatCardProps {
  label: string
  value: number
  /** 단위(명·개·장) — 숫자 곁에 작게 */
  unit: string
}

/** 지표 카드(어드민/지표 카드 288:92) — 라벨 위·큰 숫자 아래 */
export function StatCard({ label, value, unit }: StatCardProps) {
  return (
    <div className="rounded-xl border border-admin-border bg-admin-surface px-5 py-4">
      <div className="text-[13px] text-admin-muted">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[26px] font-bold leading-none tracking-tight">
          {formatCount(value)}
        </span>
        <span className="text-[13px] text-admin-muted">{unit}</span>
      </div>
    </div>
  )
}
