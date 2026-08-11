import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { listAdminGroups } from '../api/admin'
import type { AdminGroupRow, AdminGroupSort } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { Pagination } from '../components/Pagination'
import { formatCount, formatDate, groupLabel } from '../lib/format'

/** BE 기본값과 동일(1~100 제약) — 페이지 크기 UI는 1차에 두지 않는다 */
const PAGE_SIZE = 20

/**
 * 생성일 정렬만 고른다 — 이름 정렬은 BE 화이트리스트에 남아 있지만 이름을 화면에 안 보여주는
 * 이상 순서의 근거가 안 보인다(CHMO-670). 같은 이유로 이름 검색창도 없다.
 */
const SORT_OPTIONS: { value: AdminGroupSort; label: string }[] = [
  { value: 'createdAt,desc', label: '최신순' },
  { value: 'createdAt,asc', label: '오래된순' },
]

/** A2 모임 목록(289:45) — 정렬·페이지네이션 표 */
export function AdminGroupsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<AdminGroupSort>('createdAt,desc')

  const list = useApi(
    `admin-groups?page=${page}&size=${PAGE_SIZE}&sort=${sort}`,
    (signal) => listAdminGroups({ page, size: PAGE_SIZE, sort }, signal),
  )

  const columns: AdminColumn<AdminGroupRow>[] = [
    {
      key: 'group',
      header: '모임',
      render: (g) => <span className="font-medium">{groupLabel(g.groupId)}</span>,
    },
    {
      key: 'members',
      header: '멤버 수',
      align: 'right',
      widthClassName: 'w-24',
      render: (g) => formatCount(g.memberCount),
    },
    {
      key: 'events',
      header: '이벤트 수',
      align: 'right',
      widthClassName: 'w-24',
      render: (g) => formatCount(g.eventCount),
    },
    {
      key: 'photos',
      header: '사진 수',
      align: 'right',
      widthClassName: 'w-28',
      render: (g) => formatCount(g.photoCount),
    },
    {
      key: 'createdAt',
      header: '생성일',
      align: 'right',
      widthClassName: 'w-32',
      render: (g) => formatDate(g.createdAt),
    },
  ]

  const total = list.data?.pageInfo?.totalElements

  return (
    <>
      <AdminTopbar
        left="모임"
        right={total !== undefined ? `총 ${formatCount(total)}개` : undefined}
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        <div className="flex items-center justify-end">
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as AdminGroupSort)
              setPage(0)
            }}
            aria-label="정렬"
            className="h-9 rounded-lg border border-admin-border bg-admin-surface px-2.5 text-[13px] focus:border-primary focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {list.error ? (
          <AdminErrorMessage error={list.error} onRetry={list.refetch} />
        ) : !list.data ? (
          <AdminMessage text="불러오는 중이에요…" />
        ) : (
          <div className="rounded-xl border border-admin-border bg-admin-surface">
            <AdminTable
              columns={columns}
              rows={list.data.items}
              rowKey={(g) => g.groupId}
              onRowClick={(g) => navigate(`/admin/groups/${g.groupId}`)}
              emptyText="아직 만들어진 모임이 없어요."
              dimmed={list.loading}
            />
            {list.data.pageInfo && list.data.pageInfo.totalPages > 0 ? (
              <div className="border-t border-admin-border">
                <Pagination
                  pageInfo={list.data.pageInfo}
                  rowCount={list.data.items.length}
                  onPage={setPage}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
