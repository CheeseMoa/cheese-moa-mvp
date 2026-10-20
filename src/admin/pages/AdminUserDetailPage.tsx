import { adminPath } from '../paths'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import {
  getAdminOrganizationSubscriptionHistory,
  getAdminUserCredits,
  getAdminUserSummary,
  voidAdminSubscriptionPeriod,
} from '../api/admin'
import type {
  AdminCreditLedgerItem,
  AdminCursorPage,
  AdminSubscriptionHistoryPeriod,
  AdminUserGroupMembership,
} from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminConfirmDialog } from '../components/AdminConfirmDialog'
import { AdminLoadMore } from '../components/AdminLoadMore'
import { AdminNotice } from '../components/AdminForm'
import { AdminToast } from '../components/AdminToast'
import { CreditAdjustDialog } from '../components/CreditAdjustDialog'
import { SubscriptionAccessBadge, SubscriptionPeriodKindBadge } from '../components/StatusBadge'
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
  groupTypeLabel,
  memberRoleLabel,
  memberStatusLabel,
  socialProvidersLabel,
  subscriptionAccessLabel,
  userRoleLabel,
} from '../lib/format'

const LEDGER_PAGE_SIZE = 20

/** 장부 커서 페이지 + 잔액 — 잔액은 첫 페이지 응답에만 있어 페이지에 얹어 둔다(useCursorList `first`) */
type CreditsPage = AdminCursorPage<AdminCreditLedgerItem> & { balance: number }

/**
 * 사용자 상세 (CHMO-931·932 — BE CHMO-912·932) · `/admin/users/:userId`.
 *
 * 한 사용자에게 운영자가 손댈 수 있는 두 가지: **무료 사진 장수**(개인 모임 업로드가 여기서 차감된다)와
 * **기관 이용 기간**(기관 계정일 때). 둘은 다른 과금 축이라 카드를 가른다 — 기관 계정도 개인 범위
 * 모임에 들어가 업로드하면 장수를 쓰므로 장수 카드는 누구에게나 있다.
 *
 * 머리는 사용자 요약 API(CHMO-932 A-5)가 채운다 — 닉네임·계정 유형·어드민 권한·가입일·로그인 수단·속한
 * 모임. 종전(CHMO-931)엔 요약 API가 없어 검색 API를 `query=<id>`로 다시 불러 id가 같은 행을 집었다.
 * 기관 이용 기간 구획은 **이력 API**(A-4)로 무효화분까지 전부 보여 주고 어느 기간이든 무효화한다 —
 * 종전엔 이번 세션에 등록한 기간만 되돌릴 수 있었다. 가입 체험(BE CHMO-940)은 '가입 체험' 배지로 갈린다.
 */
export function AdminUserDetailPage() {
  const { userId: param } = useParams<{ userId: string }>()
  const userId = Number(param)
  const valid = Number.isInteger(userId) && userId > 0

  const head = useApi(valid ? `admin-user:${userId}` : null, (signal) =>
    getAdminUserSummary(userId, signal),
  )
  const user = head.data

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
  const userGone = head.error?.status === 404 || credits.error?.status === 404

  // 기관 계정만 이력을 읽는다 — 개인 계정에 부르면 VALID400이라 키를 null로 둬 요청 자체가 안 나간다
  const history = useApi(
    user?.accountType === 'ORGANIZATION' ? `admin-org-history:${userId}` : null,
    (signal) => getAdminOrganizationSubscriptionHistory(userId, signal),
  )

  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )

  // ── 장수 조정 ──
  const [adjusting, setAdjusting] = useState<CreditAdjustMode | null>(null)

  // ── 기관 이용 기간 ──
  const [registering, setRegistering] = useState(false)
  const [voiding, setVoiding] = useState<AdminSubscriptionHistoryPeriod | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const mutate = useMutation()

  const voidPeriod = async () => {
    if (!voiding) return
    const target = voiding
    setVoidBusy(true)
    await mutate(() => voidAdminSubscriptionPeriod(target.periodId), {
      noAuthRedirect: true,
      onSuccess: (result) => {
        setVoidBusy(false)
        setVoiding(null)
        history.refetch()
        showToast(
          `기간을 무효화했어요 · 지금 상태: ${subscriptionAccessLabel(result.accessStatus)}`,
        )
      },
      onError: (message, err) => {
        setVoidBusy(false)
        setVoiding(null)
        if (err instanceof ApiRequestError && err.status === 404) {
          showToast('이미 없는 기간이에요 · 다른 관리자가 처리했을 수 있어요.')
          history.refetch()
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
                  to={adminPath(`/groups/${row.groupId}`)}
                  className="text-accent hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {groupLabel(row.groupId)}
                </Link>
              ) : null}
              {row.groupName
                ? ` · ${row.groupName}`
                : row.groupId !== null
                  ? ' · (지워진 모임)'
                  : ''}
              {row.eventName
                ? ` › ${row.eventName}`
                : row.eventId !== null
                  ? ' › (지워진 이벤트)'
                  : ''}
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
            row.delta > 0
              ? 'text-admin-status-published'
              : row.delta < 0
                ? 'text-warn'
                : 'text-admin-muted'
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

  const dim = (period: AdminSubscriptionHistoryPeriod) =>
    period.voidedAt ? 'line-through opacity-50' : ''

  const periodColumns: AdminColumn<AdminSubscriptionHistoryPeriod>[] = [
    {
      key: 'range',
      header: '이용 기간',
      widthClassName: 'w-52',
      render: (p) => (
        <span className={`whitespace-nowrap tabular-nums ${dim(p)}`}>
          {formatDate(p.accessFrom)} ~ {accessUntilToKstDate(p.accessUntil)}
        </span>
      ),
    },
    {
      key: 'kind',
      header: '출처',
      widthClassName: 'w-28',
      render: (p) => <SubscriptionPeriodKindBadge kind={p.kind} />,
    },
    {
      key: 'payment',
      header: '입금',
      render: (p) => (
        <div className={`leading-tight ${dim(p)}`}>
          <div>
            {formatKrw(p.amountKrw)} · {p.paidOn} · {p.payerName}
            {p.invoiceNo ? ` · ${p.invoiceNo}` : ''}
          </div>
          {p.memo ? <div className="mt-0.5 text-xs text-admin-muted">{p.memo}</div> : null}
        </div>
      ),
    },
    {
      // 가입 체험은 서버가 넣어 관리자가 없다 — '서버'로 적어 "누가 넣었나"의 답을 비워 두지 않는다
      key: 'registered',
      header: '등록',
      widthClassName: 'w-40',
      render: (p) => (
        <span className={`whitespace-nowrap text-xs text-admin-muted ${dim(p)}`}>
          {formatDateTime(p.createdAt)} ·{' '}
          {p.adminId === null ? '서버(체험)' : `관리자 #${p.adminId}`}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      widthClassName: 'w-28',
      render: (p) =>
        p.voidedAt ? (
          <span className="whitespace-nowrap text-xs text-admin-muted">
            {formatDate(p.voidedAt)} 무효화됨
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setVoiding(p)}
            className="h-7 rounded-md border border-admin-border bg-admin-surface px-2.5 text-xs text-admin-muted hover:bg-admin-bg hover:text-admin-text"
          >
            무효화
          </button>
        ),
    },
  ]

  const title = user ? user.nickname : `#${param ?? ''}`

  return (
    <>
      <AdminTopbar
        left={
          <>
            <Link
              to={adminPath('/users')}
              className="font-normal text-admin-muted hover:text-admin-text"
            >
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
            <p className="text-[13px] text-admin-muted">
              사용자를 찾을 수 없어요 · 계정이 지워졌을 수 있어요.
            </p>
            <Link
              to={adminPath('/users')}
              className="h-8 rounded-lg border border-admin-border px-3 text-[13px] leading-8 hover:bg-admin-bg"
            >
              사용자 검색으로
            </Link>
          </div>
        ) : (
          <>
            {/* ── 요약(CHMO-932) ── */}
            {head.error ? (
              <AdminErrorMessage error={head.error} onRetry={head.refetch} />
            ) : !user ? (
              <AdminMessage text="불러오는 중이에요…" />
            ) : (
              <section className="rounded-xl border border-admin-border bg-admin-surface px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold">{user.nickname}</h1>
                  <span className="text-[13px] text-admin-muted">#{user.userId}</span>
                  <span className="rounded border border-admin-border px-1.5 py-px text-[11px] text-admin-muted">
                    {accountTypeLabel(user.accountType)} 계정
                  </span>
                  {user.role === 'ADMIN' ? (
                    <span className="rounded bg-admin-nav px-1.5 py-px text-[11px] text-admin-text">
                      {userRoleLabel(user.role)} 권한
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[13px] text-admin-muted">
                  가입일 <Strong>{formatDate(user.createdAt)}</Strong>
                  <Dot /> 로그인 <Strong>{socialProvidersLabel(user.socialProviders)}</Strong>
                  <Dot /> 속한 모임 <Strong>{formatCount(user.groups.length)}개</Strong>
                </p>
                {user.groups.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {user.groups.map((membership) => (
                      <li key={membership.groupId}>
                        <GroupChip membership={membership} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            )}

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
                      기관 범위 모임은 장수 대신 이용 기간으로 올려요 · 가입 때 체험 14일이 자동으로
                      들어가고, 종료 뒤 7일 유예 그 뒤 차단
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

                {history.error ? (
                  <div className="px-5 py-4">
                    <AdminErrorMessage error={history.error} onRetry={history.refetch} />
                  </div>
                ) : !history.data ? (
                  <AdminMessage text="불러오는 중이에요…" />
                ) : (
                  <>
                    <p className="flex items-center gap-2 px-5 py-4 text-[13px]">
                      <span className="text-admin-muted">지금 상태</span>
                      <SubscriptionAccessBadge status={history.data.accessStatus} />
                      {history.data.accessUntil ? (
                        <span className="text-admin-muted">
                          {accessUntilToKstDate(history.data.accessUntil)}까지 · 유예 종료{' '}
                          {history.data.graceEndsAt ? formatDate(history.data.graceEndsAt) : '—'}
                        </span>
                      ) : (
                        <span className="text-admin-muted">
                          등록된 기간이 없어요 · 지금 업로드가 막혀요
                        </span>
                      )}
                    </p>
                    <div className="border-t border-admin-border">
                      <AdminTable
                        columns={periodColumns}
                        rows={history.data.periods}
                        rowKey={(p) => p.periodId}
                        emptyText="등록된 기간이 없어요 · [이용 기간 등록]으로 첫 기간을 더해요."
                        dimmed={history.loading}
                      />
                    </div>
                  </>
                )}
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
            history.refetch()
            showToast(
              `이용 기간을 등록했어요 · ${accessUntilToKstDate(result.period.accessUntil)}까지`,
            )
          }}
        />
      ) : null}

      {voiding ? (
        <AdminConfirmDialog
          title="이 기간을 무효화할까요?"
          lines={[
            `${formatDate(voiding.accessFrom)} ~ ${accessUntilToKstDate(voiding.accessUntil)} · ${formatKrw(voiding.amountKrw)}${voiding.kind === 'TRIAL' ? ' · 가입 체험' : ''}`,
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

/** 속한 모임 칩 — `모임 #45 · 비즈니스 · 관리자 (승인 대기)` → 모임 상세. 역할 라벨은 모임 유형을 본다 */
function GroupChip({ membership }: { membership: AdminUserGroupMembership }) {
  return (
    <Link
      to={adminPath(`/groups/${membership.groupId}`)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-admin-border bg-admin-surface px-2.5 py-1 text-[12px] hover:border-primary hover:bg-admin-nav"
    >
      <span className="font-medium">{groupLabel(membership.groupId)}</span>
      <span className="text-admin-muted">
        {groupTypeLabel(membership.groupType)} ·{' '}
        {memberRoleLabel(membership.role, membership.groupType)}
      </span>
      {membership.status === 'PENDING' ? (
        <span className="rounded bg-admin-status-analyzing/15 px-1 py-px text-[11px] text-admin-status-analyzing">
          {memberStatusLabel('PENDING')}
        </span>
      ) : null}
    </Link>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-admin-text">{children}</span>
}

function Dot() {
  return <span className="mx-1.5 text-admin-border">·</span>
}
