import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import { getAdminUserCredits, searchAdminUsers, voidAdminSubscriptionPeriod } from '../api/admin'
import type {
  AdminCreditLedgerItem,
  AdminCursorPage,
  AdminOrganizationSubscription,
  AdminSubscriptionPeriod,
  AdminUserRow,
} from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminConfirmDialog } from '../components/AdminConfirmDialog'
import { AdminLoadMore } from '../components/AdminLoadMore'
import { AdminNotice } from '../components/AdminForm'
import { AdminToast } from '../components/AdminToast'
import { CreditAdjustDialog } from '../components/CreditAdjustDialog'
import { SubscriptionAccessBadge } from '../components/StatusBadge'
import { SubscriptionPeriodDialog } from '../components/SubscriptionPeriodDialog'
import { useCursorList } from '../hooks/useCursorList'
import { accessUntilToKstDate, formatKrw, type CreditAdjustMode } from '../lib/billing'
import {
  accountTypeLabel,
  creditReasonLabel,
  formatCount,
  formatDate,
  formatDateTime,
  formatSignedCount,
  groupLabel,
  subscriptionAccessLabel,
} from '../lib/format'

const LEDGER_PAGE_SIZE = 20

/** 장부 커서 페이지 + 잔액 — 잔액은 첫 페이지 응답에만 있어 페이지에 얹어 둔다(useCursorList `first`) */
type CreditsPage = AdminCursorPage<AdminCreditLedgerItem> & { balance: number }

/**
 * 사용자 상세 (CHMO-931 — BE CHMO-912) · `/admin/users/:userId`.
 *
 * 한 사용자에게 운영자가 손댈 수 있는 두 가지: **무료 사진 장수**(개인 모임 업로드가 여기서 차감된다)와
 * **기관 이용 기간**(기관 계정일 때). 둘은 다른 과금 축이라 카드를 가른다 — 기관 계정도 개인 범위
 * 모임에 들어가 업로드하면 장수를 쓰므로 장수 카드는 누구에게나 있다.
 *
 * 머리(닉네임·계정 유형)는 사용자 요약 API가 없어(BE CHMO-932) 검색 API를 `query=<id>`로 다시 불러
 * 읽는다 — 검색이 "닉네임에 그 숫자가 들어간 사람"도 돌려주므로 id가 같은 행만 집는다.
 */
export function AdminUserDetailPage() {
  const { userId: param } = useParams<{ userId: string }>()
  const userId = Number(param)
  const valid = Number.isInteger(userId) && userId > 0

  const head = useApi(valid ? `admin-user-head:${userId}` : null, (signal) =>
    searchAdminUsers({ query: String(userId), size: 50 }, signal),
  )
  const user: AdminUserRow | null = head.data?.items.find((u) => u.userId === userId) ?? null
  const headMissing = head.data !== null && user === null

  const credits = useCursorList<AdminCreditLedgerItem, CreditsPage>(
    valid ? `admin-user-credits:${userId}` : null,
    (cursor, signal) =>
      getAdminUserCredits(userId, { cursor, size: LEDGER_PAGE_SIZE }, signal).then((result) => ({
        ...result.ledger,
        balance: result.balance,
      })),
  )
  // 장수 기능이 서버에 안 켜진 건 오류가 아니라 상태다(BILLING503) — 안내로 보여준다
  const creditsDisabled = credits.error?.code === 'BILLING_UNAVAILABLE'
  const userGone = head.error?.status === 404 || credits.error?.status === 404 || headMissing

  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )

  // ── 장수 조정 ──
  const [adjusting, setAdjusting] = useState<CreditAdjustMode | null>(null)

  // ── 기관 이용 기간 — 이번 세션에 등록한 것만(이력 조회 API는 BE CHMO-932) ──
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState<AdminOrganizationSubscription[]>([])
  const [voiding, setVoiding] = useState<AdminSubscriptionPeriod | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const mutate = useMutation()
  const latestAccess = registered[0] ?? null

  const voidPeriod = async () => {
    if (!voiding) return
    const target = voiding
    setVoidBusy(true)
    await mutate(() => voidAdminSubscriptionPeriod(target.periodId), {
      noAuthRedirect: true,
      onSuccess: (result) => {
        setVoidBusy(false)
        setVoiding(null)
        // 무효화 응답은 nickname이 null이라 머리의 이름을 지키고, 접근 상태·기간은 응답으로 갈아 끼운다
        setRegistered((prev) => [
          { ...result, nickname: result.nickname ?? user?.nickname ?? null },
          ...prev.filter((entry) => entry.period.periodId !== result.period.periodId),
        ])
        showToast(`기간을 무효화했어요 · 지금 상태: ${subscriptionAccessLabel(result.accessStatus)}`)
      },
      onError: (message, err) => {
        setVoidBusy(false)
        setVoiding(null)
        if (err instanceof ApiRequestError && err.status === 404) {
          showToast('이미 없는 기간이에요 · 다른 관리자가 처리했을 수 있어요.')
          return
        }
        showToast(message)
      },
    })
  }

  const ledgerColumns: AdminColumn<AdminCreditLedgerItem>[] = [
    {
      key: 'createdAt',
      header: '시각',
      widthClassName: 'w-36',
      render: (row) => (
        <span className="whitespace-nowrap tabular-nums text-admin-muted">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: '사유',
      render: (row) => (
        <div className="leading-tight">
          <div>{creditReasonLabel(row.reason)}</div>
          {row.groupId !== null || row.eventId !== null ? (
            <div className="mt-0.5 text-xs text-admin-muted">
              {row.groupId !== null ? (
                <Link
                  to={`/admin/groups/${row.groupId}`}
                  className="text-accent hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {groupLabel(row.groupId)}
                </Link>
              ) : null}
              {row.groupName ? ` · ${row.groupName}` : row.groupId !== null ? ' · (지워진 모임)' : ''}
              {row.eventName ? ` › ${row.eventName}` : row.eventId !== null ? ' › (지워진 이벤트)' : ''}
            </div>
          ) : null}
          {row.memo ? <div className="mt-0.5 text-xs text-admin-muted">{row.memo}</div> : null}
        </div>
      ),
    },
    {
      key: 'delta',
      header: '증감',
      align: 'right',
      widthClassName: 'w-24',
      render: (row) => (
        <span
          className={`font-medium tabular-nums ${
            row.delta > 0 ? 'text-admin-status-published' : row.delta < 0 ? 'text-warn' : 'text-admin-muted'
          }`}
        >
          {formatSignedCount(row.delta)}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      header: '잔액',
      align: 'right',
      widthClassName: 'w-24',
      render: (row) => <span className="tabular-nums">{formatCount(row.balanceAfter)}</span>,
    },
  ]

  const title = user ? user.nickname : `#${param ?? ''}`

  return (
    <>
      <AdminTopbar
        left={
          <>
            <Link to="/admin/users" className="font-normal text-admin-muted hover:text-admin-text">
              사용자
            </Link>
            <span className="font-normal text-admin-muted">/</span>
            <span>{title}</span>
          </>
        }
        right={user ? `#${user.userId} · ${accountTypeLabel(user.accountType)} 계정` : undefined}
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        {!valid || userGone ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-admin-border bg-admin-surface px-5 py-10">
            <p className="text-[13px] text-admin-muted">사용자를 찾을 수 없어요 · 계정이 지워졌을 수 있어요.</p>
            <Link
              to="/admin/users"
              className="h-8 rounded-lg border border-admin-border px-3 text-[13px] leading-8 hover:bg-admin-bg"
            >
              사용자 검색으로
            </Link>
          </div>
        ) : (
          <>
            {head.error ? <AdminErrorMessage error={head.error} onRetry={head.refetch} /> : null}

            {/* ── 무료 사진 장수 ── */}
            <section className="rounded-xl border border-admin-border bg-admin-surface">
              <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                <div>
                  <h2 className="text-[14px] font-semibold">무료 사진 장수</h2>
                  <p className="mt-0.5 text-xs text-admin-muted">
                    개인 범위 모임에 올린 사진만큼 줄어요 · 매일 10장씩 500장까지 적립
                  </p>
                </div>
                {credits.first ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjusting('grant')}
                      className="h-8 rounded-lg border border-primary bg-primary px-3 text-[13px] font-semibold text-admin-text hover:brightness-95"
                    >
                      장수 지급
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjusting('revoke')}
                      className="h-8 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text hover:bg-admin-bg"
                    >
                      회수
                    </button>
                  </div>
                ) : null}
              </div>

              {creditsDisabled ? (
                <div className="px-5 py-4">
                  <AdminNotice
                    title="장수 기능이 서버에서 아직 켜지지 않았어요"
                    lines={[
                      '서버 설정 CREDIT_ENFORCEMENT_STARTS_AT이 비어 있으면 잔액·장부 조회와 지급이 모두 막혀요(BILLING503).',
                      '지금은 누구나 장수와 무관하게 올릴 수 있어요 · 앱 2.6.0 공개 뒤 설정을 켜면 이 카드가 살아나요.',
                    ]}
                  />
                </div>
              ) : credits.error ? (
                <div className="px-5 py-4">
                  <AdminErrorMessage error={credits.error} onRetry={credits.refetch} />
                </div>
              ) : !credits.first ? (
                <AdminMessage text="불러오는 중이에요…" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2 px-5 py-4">
                    <span className="text-[26px] font-bold leading-none tracking-tight">
                      {formatCount(credits.first.balance)}
                    </span>
                    <span className="text-[13px] text-admin-muted">장 남음</span>
                  </div>
                  <div className="border-t border-admin-border">
                    <AdminTable
                      columns={ledgerColumns}
                      rows={credits.items}
                      rowKey={(row) => row.ledgerId}
                      emptyText="아직 장부 기록이 없어요."
                      dimmed={credits.loading}
                    />
                    <AdminLoadMore
                      hasNext={credits.hasNext}
                      loading={credits.loadingMore}
                      error={credits.moreError}
                      onLoadMore={credits.loadMore}
                    />
                  </div>
                </>
              )}
            </section>

            {/* ── 기관 이용 기간(기관 계정만) ── */}
            {user?.accountType === 'ORGANIZATION' ? (
              <section className="rounded-xl border border-admin-border bg-admin-surface">
                <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                  <div>
                    <h2 className="text-[14px] font-semibold">기관 이용 기간</h2>
                    <p className="mt-0.5 text-xs text-admin-muted">
                      기관 범위 모임은 장수 대신 이용 기간으로 올려요 · 종료 뒤 7일 유예, 그 뒤 차단
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRegistering(true)}
                    className="h-8 rounded-lg border border-primary bg-primary px-3 text-[13px] font-semibold text-admin-text hover:brightness-95"
                  >
                    이용 기간 등록
                  </button>
                </div>
                <div className="space-y-3 px-5 py-4">
                  {latestAccess ? (
                    <p className="flex items-center gap-2 text-[13px]">
                      <span className="text-admin-muted">지금 상태</span>
                      <SubscriptionAccessBadge status={latestAccess.accessStatus} />
                      {latestAccess.accessUntil ? (
                        <span className="text-admin-muted">
                          {accessUntilToKstDate(latestAccess.accessUntil)}까지 · 유예 종료{' '}
                          {latestAccess.graceEndsAt ? formatDate(latestAccess.graceEndsAt) : '—'}
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-xs text-admin-muted">
                      지금 상태와 지난 기간은{' '}
                      <Link to="/admin/organizations" className="text-accent hover:underline">
                        기관 구독
                      </Link>{' '}
                      목록에서 확인해요 · 이력 조회는 서버 확장 뒤에 이 자리로 와요.
                    </p>
                  )}

                  {registered.length > 0 ? (
                    <ul className="divide-y divide-admin-border rounded-lg border border-admin-border">
                      {registered.map(({ period }) => (
                        <li key={period.periodId} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                          <div className={`min-w-0 flex-1 leading-tight ${period.voidedAt ? 'line-through opacity-50' : ''}`}>
                            <div>
                              {formatDate(period.accessFrom)} ~ {accessUntilToKstDate(period.accessUntil)}
                              <span className="ml-2 text-admin-muted">
                                {formatKrw(period.amountKrw)} · {period.paidOn} 입금 · {period.payerName}
                                {period.invoiceNo ? ` · ${period.invoiceNo}` : ''}
                              </span>
                            </div>
                            {period.memo ? <div className="mt-0.5 text-xs text-admin-muted">{period.memo}</div> : null}
                          </div>
                          {period.voidedAt ? (
                            <span className="text-xs text-admin-muted">무효화됨</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setVoiding(period)}
                              className="h-7 shrink-0 rounded-md border border-admin-border bg-admin-surface px-2.5 text-xs text-admin-muted hover:bg-admin-bg hover:text-admin-text"
                            >
                              무효화
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      {adjusting && credits.first ? (
        <CreditAdjustDialog
          userId={userId}
          nickname={user?.nickname ?? null}
          balance={credits.first.balance}
          initialMode={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={(result) => {
            setAdjusting(null)
            credits.refetch()
            showToast(
              result.delta > 0
                ? `${formatCount(result.delta)}장을 지급했어요 · 잔액 ${formatCount(result.balance)}장`
                : `${formatCount(-result.delta)}장을 회수했어요 · 잔액 ${formatCount(result.balance)}장`,
            )
          }}
        />
      ) : null}

      {registering && user ? (
        <SubscriptionPeriodDialog
          userId={userId}
          nickname={user.nickname}
          onClose={() => setRegistering(false)}
          onRegistered={(result) => {
            setRegistering(false)
            setRegistered((prev) => [result, ...prev])
            showToast(`이용 기간을 등록했어요 · ${accessUntilToKstDate(result.period.accessUntil)}까지`)
          }}
        />
      ) : null}

      {voiding ? (
        <AdminConfirmDialog
          title="이 기간을 무효화할까요?"
          lines={[
            `${formatDate(voiding.accessFrom)} ~ ${accessUntilToKstDate(voiding.accessUntil)} · ${formatKrw(voiding.amountKrw)}`,
            '무효화한 기간은 이용 상태 계산에서 빠져요 · 다른 기간이 없으면 바로 유예 또는 차단이 돼요.',
            '기록은 지워지지 않고 무효화로 남아요.',
          ]}
          confirmLabel="무효화"
          busy={voidBusy}
          onCancel={() => setVoiding(null)}
          onConfirm={() => void voidPeriod()}
        />
      ) : null}

      {toast ? (
        <AdminToast message={toast.message} nonce={toast.nonce} onDismiss={dismissToast} />
      ) : null}
    </>
  )
}
