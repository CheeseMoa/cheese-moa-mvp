import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { listAdminGroups } from '../api/admin'
import type { AdminGroupRow, AdminGroupSort } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { Pagination } from '../components/Pagination'
import { formatCount, formatDate } from '../lib/format'

/** BE 기본값과 동일(1~100 제약) — 페이지 크기 UI는 1차에 두지 않는다 */
const PAGE_SIZE = 20

/** BE sort 화이트리스트(createdAt·name × asc·desc) 안에서만 고른다 — 밖은 COMMON400 */
const SORT_OPTIONS: { value: AdminGroupSort; label: string }[] = [
  { value: 'createdAt,desc', label: '최신순' },
  { value: 'createdAt,asc', label: '오래된순' },
  { value: 'name,asc', label: '이름순' },
]

/** A2 모임 목록(289:45) — 검색·정렬·페이지네이션 표 */
export function AdminGroupsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<AdminGroupSort>('createdAt,desc')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')

  // 타이핑마다 서버를 부르지 않게 300ms 디바운스 — 확정된 검색어만 요청 키에 들어간다
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [qInput])

  const list = useApi(
    `admin-groups?page=${page}&size=${PAGE_SIZE}&q=${q}&sort=${sort}`,
    (signal) => listAdminGroups({ page, size: PAGE_SIZE, q, sort }, signal),
  )

  const columns: AdminColumn<AdminGroupRow>[] = [
    { key: 'name', header: '모임명', render: (g) => <span className="font-medium">{g.name}</span> },
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-border bg-admin-surface px-4 py-3">
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="모임명 검색"
            aria-label="모임명 검색"
            className="h-9 w-80 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] placeholder:text-admin-muted focus:border-primary focus:outline-none"
          />
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
              emptyText={q ? `'${q}' 검색 결과가 없어요.` : '아직 만들어진 모임이 없어요.'}
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
