import type { ReactNode } from 'react'

interface AdminTopbarProps {
  /** 좌측 — 화면 제목 또는 브레드크럼(admin-spec §3-0 상단바) */
  left: ReactNode
  /** 우측 — 보조 정보(마지막 갱신·총 N개·조회 전용). 없으면 비워 둔다 */
  right?: ReactNode
}

/** 상단바 — 높이 56·좌우 패딩 28·하단 1px 보더(admin-spec §3-0) */
export function AdminTopbar({ left, right }: AdminTopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-admin-border bg-admin-surface px-7">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold">{left}</div>
      {right ? <div className="text-xs text-admin-muted">{right}</div> : null}
    </header>
  )
}
