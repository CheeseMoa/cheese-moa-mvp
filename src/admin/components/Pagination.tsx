import type { BePageInfo } from '../../api/client'
import { formatCount } from '../lib/format'

interface PaginationProps {
  pageInfo: BePageInfo
  /** 현재 페이지에 실제로 실린 행 수 — "1–10 / 47개" 좌측 표기용 */
  rowCount: number
  onPage: (page: number) => void
}

/** 현재 페이지를 가운데 두고 최대 5칸 — 끝에 붙으면 창을 밀어 항상 5칸을 채운다 */
function pageWindow(current: number, totalPages: number): number[] {
  const span = Math.min(5, totalPages)
  const start = Math.max(0, Math.min(current - Math.floor(span / 2), totalPages - span))
  return Array.from({ length: span }, (_, i) => start + i)
}

/** 표 하단 페이지네이션(A2) — 좌측 범위 표기·우측 ‹ 페이지 › 버튼, 현재 페이지는 옐로우 */
export function Pagination({ pageInfo, rowCount, onPage }: PaginationProps) {
  const { page, size, hasNext, totalElements, totalPages } = pageInfo
  const start = totalElements === 0 ? 0 : page * size + 1
  const end = totalElements === 0 ? 0 : page * size + rowCount

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-xs text-admin-muted">
        {start === 0 ? '0개' : `${formatCount(start)}–${formatCount(end)} / ${formatCount(totalElements)}개`}
      </span>
      <nav className="flex items-center gap-1" aria-label="페이지">
        <PageButton disabled={page === 0} onClick={() => onPage(page - 1)} label="이전 페이지">
          ‹
        </PageButton>
        {pageWindow(page, totalPages).map((p) => (
          <PageButton
            key={p}
            current={p === page}
            onClick={() => onPage(p)}
            label={`${p + 1}페이지`}
          >
            {p + 1}
          </PageButton>
        ))}
        <PageButton disabled={!hasNext} onClick={() => onPage(page + 1)} label="다음 페이지">
          ›
        </PageButton>
      </nav>
    </div>
  )
}

function PageButton({
  children,
  onClick,
  disabled,
  current,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  current?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || current}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={`h-8 min-w-8 rounded-lg border px-2 text-[13px] ${
        current
          ? 'border-primary bg-primary font-semibold text-admin-text'
          : 'border-admin-border bg-admin-surface text-admin-muted hover:bg-admin-bg disabled:opacity-40 disabled:hover:bg-admin-surface'
      }`}
    >
      {children}
    </button>
  )
}
