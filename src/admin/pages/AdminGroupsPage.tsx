import { adminPath } from '../paths'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { listAdminGroups } from '../api/admin'
import type { AdminGroupRow, AdminGroupSort, AdminGroupType } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { Pagination } from '../components/Pagination'
import { formatCount, formatDate, formatDateTime, groupLabel, groupTypeLabel } from '../lib/format'

/** BE 기본값과 동일(1~100 제약) — 페이지 크기 UI는 1차에 두지 않는다 */
const PAGE_SIZE = 20

/**
 * 정렬 4종(CHMO-932) — 기본은 **최근 업로드순**(운영자가 찾는 건 "지금 쓰이는 모임"이지 "최근 만든 모임"이
 * 아니다). 사진 없는 모임은 방향과 무관하게 맨 뒤(BE nulls last). 이름 정렬은 BE 화이트리스트에 남아
 * 있지만 이름을 화면에 안 보여주는 이상 순서의 근거가 안 보인다(CHMO-670). 같은 이유로 이름 검색창도 없다.
 */
const SORT_OPTIONS: { value: AdminGroupSort; label: string }[] = [
  { value: 'lastUploadedAt,desc', label: '최근 업로드순' },
  { value: 'photoCount,desc', label: '사진 많은 순' },
  { value: 'createdAt,desc', label: '최신 생성순' },
  { value: 'createdAt,asc', label: '오래된순' },
]

/** 유형 필터 — 생략(전체)은 파라미터 자체를 안 보낸다 */
const TYPE_OPTIONS: { value: AdminGroupType | ''; label: string }[] = [
  { value: '', label: '전체 유형' },
  { value: 'BUSINESS', label: '비즈니스' },
  { value: 'GENERAL', label: '일반' },
]

/** A2 모임 목록(289:45) — 정렬·유형 필터·페이지네이션 표 */
export function AdminGroupsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<AdminGroupSort>('lastUploadedAt,desc')
  const [groupType, setGroupType] = useState<AdminGroupType | ''>('')

  const list = useApi(
    `admin-groups?page=${page}&size=${PAGE_SIZE}&sort=${sort}&groupType=${groupType}`,
    (signal) =>
      listAdminGroups({ page, size: PAGE_SIZE, sort, ...(groupType ? { groupType } : {}) }, signal),
  )

  const columns: AdminColumn<AdminGroupRow>[] = [
    {
      key: 'group',
      header: '모임',
      render: (g) => <span className="font-medium">{groupLabel(g.groupId)}</span>,
    },
    {
      // 응답에 있던 groupType(CHMO-621)을 화면이 안 읽고 있었다 — 비즈니스(승인제·검수)와 일반이
      // 운영에서 다른 모임이라 목록에서 갈라 보인다(CHMO-931)
      key: 'type',
      header: '유형',
      widthClassName: 'w-24',
      render: (g) => (
        <span className="rounded border border-admin-border px-1 py-px text-[11px] text-admin-muted">
          {groupTypeLabel(g.groupType)}
        </span>
      ),
    },
    {
      key: 'members',
      header: '멤버 수',
      align: 'right',
      widthClassName: 'w-20',
      render: (g) => formatCount(g.memberCount),
    },
    {
      key: 'events',
      header: '이벤트 수',
      align: 'right',
      widthClassName: 'w-20',
      render: (g) => formatCount(g.eventCount),
    },
    {
      key: 'photos',
      header: '사진 수',
      align: 'right',
      widthClassName: 'w-24',
      render: (g) => formatCount(g.photoCount),
    },
    {
      // 최근 7일 반영 사진 — "지금 쓰이는 모임"을 숫자로(CHMO-932). 0은 '—'가 아니라 0이다(안 쓰인 것도 사실)
      key: 'recent',
      header: '최근 7일 사진',
      align: 'right',
      widthClassName: 'w-28',
      render: (g) => formatCount(g.last7DaysPhotoCount),
    },
    {
      // 사진이 앨범에 반영된 시각 — 분류 중인 업로드는 반영된 뒤에야 보인다(BE 정책, CHMO-932)
      key: 'lastUploadedAt',
      header: '마지막 업로드',
      align: 'right',
      widthClassName: 'w-36',
      render: (g) => (
        <span className="whitespace-nowrap tabular-nums">{formatDateTime(g.lastUploadedAt)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: '생성일',
      align: 'right',
      widthClassName: 'w-28',
      render: (g) => formatDate(g.createdAt),
    },
  ]

  const total = list.data?.pageInfo?.totalElements

  const selectClassName =
    'h-9 rounded-lg border border-admin-border bg-admin-surface px-2.5 text-[13px] focus:border-primary focus:outline-none'

  return (
    <>
      <AdminTopbar
        left="모임"
        right={total !== undefined ? `총 ${formatCount(total)}개` : undefined}
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-admin-muted">
            마지막 업로드는 사진이{' '}
            <b className="font-semibold text-admin-text">앨범에 반영된 시각</b>이에요 · 분류 중인
            업로드는 끝난 뒤에 잡혀요.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={groupType}
              onChange={(e) => {
                setGroupType(e.target.value as AdminGroupType | '')
                setPage(0)
              }}
              aria-label="유형 필터"
              className={selectClassName}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as AdminGroupSort)
                setPage(0)
              }}
              aria-label="정렬"
              className={selectClassName}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
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
              onRowClick={(g) => navigate(adminPath(`/groups/${g.groupId}`))}
              emptyText={
                groupType ? '이 유형의 모임이 아직 없어요.' : '아직 만들어진 모임이 없어요.'
              }
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
