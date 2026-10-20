import { adminPath } from '../paths'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listAdminOrganizationSubscriptions } from '../api/admin'
import type { AdminOrganizationSubscriptionRow } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminLoadMore } from '../components/AdminLoadMore'
import { AdminToast } from '../components/AdminToast'
import { SubscriptionAccessBadge } from '../components/StatusBadge'
import { SubscriptionPeriodDialog } from '../components/SubscriptionPeriodDialog'
import { useCursorList } from '../hooks/useCursorList'
import { accessUntilToKstDate } from '../lib/billing'
import { formatDate } from '../lib/format'

const PAGE_SIZE = 20

/**
 * 기관 구독 (CHMO-931 — BE CHMO-912 `GET /admin/organizations/subscriptions`) · `/admin/organizations`.
 *
 * 기관(유치원·어린이집·학원) 계정의 **이용 상태**와 기간 등록. 기관은 계좌이체 월 정액이라 결제가
 * 서버에 자동으로 들어오지 않는다 — 입금을 확인한 운영자가 여기서 기간을 더한다(연장도 새 기간).
 * 접근 상태는 요청 시각 기준으로 서버가 계산한다: 이용 중 → (종료) → 7일 유예 → 차단(새 업로드
 * BILLING403). **유예·차단이 손댈 행**이라 배지 색이 그렇게 갈린다.
 *
 * 구독 행이 없는 기관(기간을 한 번도 받지 않은 곳)은 이 목록에 없다 — 가입 체험(BE CHMO-940)이 행을
 * 만들므로 이제 거의 모든 기관이 여기 보이고, 체험 전 가입자만 기관 문의 개통 때 함께 등록하거나(§3-4)
 * 사용자 검색에서 찾아 등록한다. 기간 **이력**과 아무 기간이나 무효화는 사용자 상세(행 클릭)가 맡는다
 * (CHMO-932 — 이력 API).
 */
export function AdminOrganizationsPage() {
  const navigate = useNavigate()
  const list = useCursorList<AdminOrganizationSubscriptionRow>(
    'admin-org-subscriptions',
    (cursor, signal) => listAdminOrganizationSubscriptions({ cursor, size: PAGE_SIZE }, signal),
  )

  const [registering, setRegistering] = useState<AdminOrganizationSubscriptionRow | null>(null)
  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )

  const columns: AdminColumn<AdminOrganizationSubscriptionRow>[] = [
    {
      key: 'organization',
      header: '기관 계정',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{row.nickname ?? '(지워진 계정)'}</span>
          <span className="text-xs text-admin-muted">#{row.userId}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: '이용 상태',
      widthClassName: 'w-28',
      render: (row) => <SubscriptionAccessBadge status={row.status} />,
    },
    {
      key: 'accessUntil',
      header: '이용 종료일',
      align: 'right',
      widthClassName: 'w-32',
      render: (row) => accessUntilToKstDate(row.accessUntil) ?? '—',
    },
    {
      key: 'graceEndsAt',
      header: '유예 종료',
      align: 'right',
      widthClassName: 'w-32',
      render: (row) => (row.graceEndsAt ? formatDate(row.graceEndsAt) : '—'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      widthClassName: 'w-36',
      render: (row) => (
        // 버튼 칸은 셀 여백까지 행 클릭(상세 이동)을 막는다 — 빗겨 누른 손이 다른 화면으로 튀지 않게
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setRegistering(row)}
            className="h-7 whitespace-nowrap rounded-md border border-primary bg-primary px-2.5 text-xs font-semibold text-admin-text hover:brightness-95"
          >
            이용 기간 등록
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <AdminTopbar left="기관 구독" right="기간은 더하기만 · 가장 늦은 종료일까지 이용" />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        <p className="text-xs text-admin-muted">
          기관 계정은 가입 때 <b className="font-semibold text-admin-text">체험 14일</b>이 자동으로
          들어가요 · <b className="font-semibold text-admin-text">유예 기간</b>은 종료 뒤 7일,
          지나면 <b className="font-semibold text-admin-text">차단</b>되어 새 사진을 올릴 수 없어요.
          행을 누르면 사용자 상세에서 기간 이력을 보고 무효화할 수 있어요 · 여기 없는 기관은{' '}
          <Link to={adminPath('/users')} className="text-accent hover:underline">
            사용자
          </Link>
          에서 찾아 등록해요.
        </p>

        {list.error ? (
          <AdminErrorMessage error={list.error} onRetry={list.refetch} />
        ) : !list.first ? (
          <AdminMessage text="불러오는 중이에요…" />
        ) : (
          <div className="rounded-xl border border-admin-border bg-admin-surface">
            <AdminTable
              columns={columns}
              rows={list.items}
              rowKey={(row) => row.subscriptionId}
              onRowClick={(row) => navigate(adminPath(`/users/${row.userId}`))}
              emptyText="이용 기간을 등록한 기관이 아직 없어요."
              dimmed={list.loading}
            />
            <AdminLoadMore
              hasNext={list.hasNext}
              loading={list.loadingMore}
              error={list.moreError}
              onLoadMore={list.loadMore}
            />
          </div>
        )}
      </div>

      {registering ? (
        <SubscriptionPeriodDialog
          userId={registering.userId}
          nickname={registering.nickname}
          onClose={() => setRegistering(null)}
          onRegistered={(result) => {
            setRegistering(null)
            // 접근 상태가 바뀌었을 수 있다(차단 → 이용 중) — 목록을 다시 읽는다
            list.refetch()
            const until = accessUntilToKstDate(result.period.accessUntil)
            showToast(
              `${result.nickname ?? `#${result.organizationUserId}`}의 이용 기간을 등록했어요 · ${until}까지`,
            )
          }}
        />
      ) : null}

      {toast ? (
        <AdminToast message={toast.message} nonce={toast.nonce} onDismiss={dismissToast} />
      ) : null}
    </>
  )
}
