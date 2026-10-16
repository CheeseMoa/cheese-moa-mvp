import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { getAdminStats, listAdminInquiries } from '../api/admin'
import type { AdminRecentGroup, AdminRecentUpload } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { StatCard } from '../components/StatCard'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatMonthDayTime,
  groupLabel,
  groupTypeLabel,
} from '../lib/format'
import { useAdminOutlet } from '../outletContext'

/**
 * A1 대시보드(289:3) — 처리할 일 2칸 + **최근 업로드 10행**(CHMO-932) + 전체 누적 4칸 + 최근 7일 5칸 +
 * 최근 생성 모임 5개. 최근 업로드가 누적·7일보다 위인 건 운영자가 첫 화면에서 찾는 게 "지금 실제로
 * 쓰이는 모임·이벤트"라서다 — 종전엔 "최근 생성된 모임"뿐이라 만든 뒤 한 번도 안 쓴 모임이 맨 위였다.
 */
export function AdminDashboardPage() {
  const navigate = useNavigate()
  const stats = useApi('admin-stats', (signal) => getAdminStats(signal))

  /**
   * 대기 중 문의 건수 — 전용 카운트 API가 없어 목록을 `size=1`로 한 번 부르고 봉투의
   * `pageInfo.totalElements`만 읽는다(BE CHMO-810). `status`를 생략하면 BE 기본값이
   * 진행 중(RECEIVED·CONTACTED)이라 그대로 "대기 중"이 된다.
   * 지표(stats)와 별개 요청이라 한쪽이 실패해도 다른 쪽은 그려진다 — 이 카드는 운영자가
   * 손대야 할 일이고, 통계 조회 실패에 가려지면 안 된다.
   */
  const pendingInquiries = useApi('admin-inquiries-pending', (signal) =>
    listAdminInquiries({ page: 0, size: 1 }, signal),
  )
  const pendingInquiryCount = pendingInquiries.data?.pageInfo?.totalElements ?? null

  // 처리 대기 신고·문의(CHMO-862) — 사이드바 배지와 같은 수라 셸이 조회한 값을 받아 쓴다
  // (여기서 또 부르면 대시보드 진입마다 같은 요청이 두 번 나간다)
  const { pendingReportCount } = useAdminOutlet()

  // '마지막 갱신' = 이 화면이 지표를 받아온 시각(서버가 주는 값이 아니다 — 집계는 요청 시점 계산)
  const updatedAt = useMemo(() => (stats.data ? new Date().toISOString() : null), [stats.data])

  // BE 집계 창(요청 시각 - 7일)과 같은 창을 캡션으로 — "createdAt 기준 · 2026-07-28 ~ 08-04"
  const rangeCaption = useMemo(() => {
    const now = new Date()
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return `createdAt 기준 · ${formatDate(from.toISOString())} ~ ${formatDate(now.toISOString()).slice(5)}`
  }, [])

  // 활동 2칸·최근 업로드는 운영·테스트 계정을 뺀 값(서버 설정) — 뺐는지 안 뺐는지를 캡션이 말해야
  // "왜 Grafana와 다른가"를 안 묻는다. 신규 3칸은 전체 기준 그대로(BE가 뜻을 안 바꿨다)
  const excluded = stats.data?.excludedUserIds ?? []
  const exclusionCaption =
    excluded.length > 0
      ? `활동 모임·업로드 사용자·최근 업로드는 운영·테스트 계정 ${excluded.length}개 제외`
      : '활동 모임·업로드 사용자·최근 업로드는 전체 계정 기준(제외 계정 없음)'

  const uploadColumns: AdminColumn<AdminRecentUpload>[] = [
    {
      key: 'event',
      header: '이벤트',
      render: (u) => <span className="font-medium">{u.eventName}</span>,
    },
    {
      key: 'group',
      header: '모임',
      widthClassName: 'w-40',
      render: (u) => (
        <span className="flex items-center gap-1.5">
          <span>{groupLabel(u.groupId)}</span>
          <span className="rounded border border-admin-border px-1 py-px text-[11px] text-admin-muted">
            {groupTypeLabel(u.groupType)}
          </span>
        </span>
      ),
    },
    {
      // 업로더가 null(CHMO-805 이전 사진)이거나 탈퇴했으면 '—' — 빈 칸은 "안 불렀나"로 읽힌다
      key: 'uploader',
      header: '올린 사람',
      widthClassName: 'w-36',
      render: (u) =>
        u.uploaderUserId === null ? (
          '—'
        ) : (
          <span className="flex items-center gap-1.5">
            <span>{u.uploaderNickname ?? '(지워진 계정)'}</span>
            <span className="text-xs text-admin-muted">#{u.uploaderUserId}</span>
          </span>
        ),
    },
    {
      key: 'photos',
      header: '사진 수',
      align: 'right',
      widthClassName: 'w-20',
      render: (u) => formatCount(u.photoCount),
    },
    {
      key: 'at',
      header: '올린 시각',
      align: 'right',
      widthClassName: 'w-32',
      render: (u) => (
        <span className="whitespace-nowrap tabular-nums">{formatMonthDayTime(u.lastUploadedAt)}</span>
      ),
    },
  ]

  const recentColumns: AdminColumn<AdminRecentGroup>[] = [
    {
      key: 'group',
      header: '모임',
      render: (g) => <span className="font-medium">{groupLabel(g.groupId)}</span>,
    },
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
        <Section title="처리할 일" caption="운영자가 손대야 하는 것">
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="처리 대기 신고·문의"
              value={pendingReportCount}
              unit="건"
              to="/admin/reports"
            />
            <StatCard
              label="대기 중 기관 문의"
              value={pendingInquiryCount}
              unit="건"
              to="/admin/inquiries"
            />
          </div>
        </Section>

        {stats.loading && !stats.data ? <AdminMessage text="불러오는 중이에요…" /> : null}
        {stats.error ? <AdminErrorMessage error={stats.error} onRetry={stats.refetch} /> : null}

        {stats.data ? (
          <>
            <section className="rounded-xl border border-admin-border bg-admin-surface">
              <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                <div>
                  <h2 className="text-[14px] font-semibold">최근 업로드</h2>
                  <p className="mt-0.5 text-xs text-admin-muted">
                    최근 사진이 반영된 이벤트 10개 · 시각은 분류가 끝나 앨범에 들어간 때예요
                  </p>
                </div>
                <Link to="/admin/groups" className="text-[13px] text-accent hover:underline">
                  모임 목록(최근 업로드순) →
                </Link>
              </div>
              <AdminTable
                columns={uploadColumns}
                rows={stats.data.recentUploads}
                rowKey={(u) => u.eventId}
                onRowClick={(u) => navigate(`/admin/groups/${u.groupId}`)}
                emptyText="아직 반영된 사진이 없어요."
              />
            </section>

            <Section title="전체 누적" caption="서비스 시작 이후 총계">
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="총 가입자" value={stats.data.totals.users} unit="명" />
                <StatCard label="총 모임" value={stats.data.totals.groups} unit="개" />
                <StatCard label="총 이벤트" value={stats.data.totals.events} unit="개" />
                <StatCard label="총 사진" value={stats.data.totals.photos} unit="장" />
              </div>
            </Section>

            <Section title="최근 7일" caption={`${rangeCaption} · ${exclusionCaption}`}>
              <div className="grid grid-cols-5 gap-4">
                <StatCard label="신규 모임" value={stats.data.last7Days.newGroups} unit="개" />
                <StatCard label="신규 이벤트" value={stats.data.last7Days.newEvents} unit="개" />
                <StatCard label="업로드 사진" value={stats.data.last7Days.newPhotos} unit="장" />
                <StatCard label="활동 모임" value={stats.data.last7Days.activeGroups} unit="개" />
                <StatCard label="업로드 사용자" value={stats.data.last7Days.uploaders} unit="명" />
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
