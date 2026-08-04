import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { getAdminStats } from '../api/admin'
import type { AdminRecentGroup } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { StatCard } from '../components/StatCard'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { formatCount, formatDate, formatDateTime } from '../lib/format'

/** A1 대시보드(289:3) — 전체 누적 4칸 + 최근 7일 3칸 + 최근 생성 모임 5개 */
export function AdminDashboardPage() {
  const navigate = useNavigate()
  const stats = useApi('admin-stats', (signal) => getAdminStats(signal))

  // '마지막 갱신' = 이 화면이 지표를 받아온 시각(서버가 주는 값이 아니다 — 집계는 요청 시점 계산)
  const updatedAt = useMemo(() => (stats.data ? new Date().toISOString() : null), [stats.data])

  // BE 집계 창(요청 시각 - 7일)과 같은 창을 캡션으로 — "createdAt 기준 · 2026-07-28 ~ 08-04"
  const rangeCaption = useMemo(() => {
    const now = new Date()
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return `createdAt 기준 · ${formatDate(from.toISOString())} ~ ${formatDate(now.toISOString()).slice(5)}`
  }, [])

  const recentColumns: AdminColumn<AdminRecentGroup>[] = [
    { key: 'name', header: '모임명', render: (g) => <span className="font-medium">{g.name}</span> },
    {
      key: 'members',
      header: '멤버 수',
      align: 'right',
      widthClassName: 'w-28',
      render: (g) => formatCount(g.memberCount),
    },
    {
      key: 'createdAt',
      header: '생성일',
      align: 'right',
      widthClassName: 'w-32',
      render: (g) => formatDate(g.createdAt),
    },
  ]

  return (
    <>
      <AdminTopbar
        left="대시보드"
        right={updatedAt ? `마지막 갱신 ${formatDateTime(updatedAt)}` : undefined}
      />
      <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
        {stats.loading && !stats.data ? <AdminMessage text="불러오는 중이에요…" /> : null}
        {stats.error ? <AdminErrorMessage error={stats.error} onRetry={stats.refetch} /> : null}

        {stats.data ? (
          <>
            <Section title="전체 누적" caption="서비스 시작 이후 총계">
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="총 가입자" value={stats.data.totals.users} unit="명" />
                <StatCard label="총 모임" value={stats.data.totals.groups} unit="개" />
                <StatCard label="총 이벤트" value={stats.data.totals.events} unit="개" />
                <StatCard label="총 사진" value={stats.data.totals.photos} unit="장" />
              </div>
            </Section>

            <Section title="최근 7일" caption={rangeCaption}>
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="신규 모임" value={stats.data.last7Days.newGroups} unit="개" />
                <StatCard label="신규 이벤트" value={stats.data.last7Days.newEvents} unit="개" />
                <StatCard label="업로드 사진" value={stats.data.last7Days.newPhotos} unit="장" />
              </div>
            </Section>

            <section className="rounded-xl border border-admin-border bg-admin-surface">
              <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                <h2 className="text-[14px] font-semibold">최근 생성된 모임</h2>
                <Link
                  to="/admin/groups"
                  className="text-[13px] text-accent hover:underline"
                >
                  모임 목록 전체보기 →
                </Link>
              </div>
              <AdminTable
                columns={recentColumns}
                rows={stats.data.recentGroups}
                rowKey={(g) => g.groupId}
                onRowClick={(g) => navigate(`/admin/groups/${g.groupId}`)}
                emptyText="아직 만들어진 모임이 없어요."
              />
            </section>
          </>
        ) : null}
      </div>
    </>
  )
}

function Section({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2 border-t border-admin-border pt-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <span className="text-xs text-admin-muted">{caption}</span>
      </div>
      {children}
    </section>
  )
}
