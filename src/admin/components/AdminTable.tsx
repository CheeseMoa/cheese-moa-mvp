import type { ReactNode } from 'react'

export interface AdminColumn<T> {
  key: string
  header: string
  /** 숫자·날짜 컬럼은 우측 정렬 고정폭(admin-spec §3-0 표 규격) */
  align?: 'left' | 'right'
  /** 고정폭 컬럼용 tailwind width 클래스(w-24 등) — 이름 컬럼만 가변 */
  widthClassName?: string
  render: (row: T) => ReactNode
}

interface AdminTableProps<T> {
  columns: AdminColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** 있으면 행 전체가 클릭 대상(모임 목록 → 상세) */
  onRowClick?: (row: T) => void
  /** 0행일 때 표 대신 보여줄 안내 한 줄 */
  emptyText: string
  /** 페이지 전환 등 재조회 중 표를 흐리게 — 이전 데이터를 유지한 채 알린다 */
  dimmed?: boolean
}

/**
 * 어드민 목록 표 공용(CHMO-379) — 대시보드 최근 모임·모임 목록·상세 멤버/이벤트가 같은 표를 쓴다.
 * 행 높이 ≈42(본문 13px)·좌우 패딩 20·행 사이 1px 보더(admin-spec §3-0).
 */
export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyText,
  dimmed,
}: AdminTableProps<T>) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-[13px] text-admin-muted">{emptyText}</p>
  }
  return (
    <table className={`w-full table-auto ${dimmed ? 'opacity-50' : ''}`}>
      <thead>
        <tr className="border-b border-admin-border">
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`px-5 py-2.5 text-xs font-medium text-admin-muted ${
                column.align === 'right' ? 'text-right' : 'text-left'
              } ${column.widthClassName ?? ''}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`border-b border-admin-border last:border-b-0 ${
              onRowClick ? 'cursor-pointer hover:bg-admin-bg' : ''
            }`}
          >
            {columns.map((column) => (
              <td
                key={column.key}
                className={`px-5 py-3 text-[13px] ${
                  column.align === 'right' ? 'text-right text-admin-muted' : 'text-left'
                }`}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
