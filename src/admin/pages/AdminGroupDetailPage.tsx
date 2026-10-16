import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import { getAdminGroupDetail, revokeAdminPassGrant } from '../api/admin'
import type { AdminGroupEvent, AdminGroupMember, AdminPassGrant } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminConfirmDialog } from '../components/AdminConfirmDialog'
import { AdminToast } from '../components/AdminToast'
import { BillingScopeDialog } from '../components/BillingScopeDialog'
import { PassGrantDialog } from '../components/PassGrantDialog'
import { StatusBadge, SubscriptionAccessBadge } from '../components/StatusBadge'
import { accessUntilToKstDate } from '../lib/billing'
import {
  accountTypeLabel,
  billingScopeLabel,
  formatCount,
  formatDate,
  formatDateTime,
  groupLabel,
  groupTypeLabel,
  memberRoleLabel,
  memberStatusLabel,
  passPlanLabel,
} from '../lib/format'
import { useAdminOutlet } from '../outletContext'

/**
 * A3 모임 상세(289:87) — 헤더 카드 + 멤버 목록 + 이벤트 목록 (+ 과금·패스 — CHMO-932).
 * 멤버는 승인 대기(PENDING)도 온다(BE 정책 — 운영자는 신청도 봐야 한다): 시안엔 없던
 * 역할·대기 칩을 행에 붙여 memberCount(ACTIVE 기준)와 행 수가 달라 보이는 이유를 화면이 설명한다.
 *
 * **멤버 역할 라벨은 모임 유형을 본다**(CHMO-932): 일반 모임은 역할이 없어(전원 EDITOR) 전원 '멤버'고,
 * 비즈니스만 관리자/멤버로 갈린다 — 종전엔 EDITOR를 '선생님'이라 적어 일반 모임 멤버가 전부 선생님으로
 * 보였다. 계정 유형 칩(기관 계정)은 역할과 **다른 축**이라 따로 붙인다(기관 계정이 일반 모임의 멤버일 수 있다).
 *
 * 과금 범위에 따라 머리가 갈린다: 개인 범위는 패스 상태 + [패스 지급] + 지급 이력, 기관 범위는 과금 소유
 * 기관의 접근 상태(패스가 아니라 기관 기간이 업로드를 결정한다). [과금 범위 변경]은 둘 다.
 */
export function AdminGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { adminUserId } = useAdminOutlet()
  const detail = useApi(
    groupId ? `admin-group-${groupId}` : null,
    (signal) => getAdminGroupDetail(groupId ?? '', signal),
  )

  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )

  const [granting, setGranting] = useState(false)
  const [changingScope, setChangingScope] = useState(false)
  const [revoking, setRevoking] = useState<AdminPassGrant | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const mutate = useMutation()

  const revoke = async () => {
    if (!revoking) return
    const target = revoking
    setRevokeBusy(true)
    await mutate(() => revokeAdminPassGrant(target.grantId), {
      noAuthRedirect: true,
      onSuccess: (result) => {
        setRevokeBusy(false)
        setRevoking(null)
        detail.refetch()
        showToast(
          result.passAccessUntil
            ? `지급을 회수했어요 · 패스 만료 ${formatDateTime(result.passAccessUntil)}`
            : '지급을 회수했어요',
        )
      },
      onError: (message, err) => {
        setRevokeBusy(false)
        setRevoking(null)
        if (err instanceof ApiRequestError && err.status === 404) {
          showToast('이미 없는 지급이에요 · 다른 관리자가 처리했을 수 있어요.')
          detail.refetch()
          return
        }
        showToast(message)
      },
    })
  }

  const groupType = detail.data?.groupType ?? 'BUSINESS'

  const memberColumns: AdminColumn<AdminGroupMember>[] = [
    {
      key: 'nickname',
      header: '닉네임',
      render: (m) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{m.nickname}</span>
          <span className="rounded border border-admin-border px-1 py-px text-[11px] text-admin-muted">
            {memberRoleLabel(m.role, groupType)}
          </span>
          {m.accountType === 'ORGANIZATION' ? (
            <span className="rounded bg-admin-nav px-1 py-px text-[11px] text-admin-text">
              {accountTypeLabel(m.accountType)} 계정
            </span>
          ) : null}
          {m.status === 'PENDING' ? (
            <span className="rounded bg-admin-status-analyzing/15 px-1 py-px text-[11px] text-admin-status-analyzing">
              {memberStatusLabel(m.status)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'joinedAt',
      header: '합류일',
      align: 'right',
      widthClassName: 'w-28',
      render: (m) => formatDate(m.joinedAt),
    },
  ]

  const eventColumns: AdminColumn<AdminGroupEvent>[] = [
    { key: 'name', header: '이벤트명', render: (e) => <span className="font-medium">{e.name}</span> },
    {
      key: 'date',
      header: '날짜',
      align: 'right',
      widthClassName: 'w-28',
      render: (e) => formatDate(e.eventDate),
    },
    {
      key: 'status',
      header: '상태',
      widthClassName: 'w-24',
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: 'photos',
      header: '사진 수',
      align: 'right',
      widthClassName: 'w-20',
      render: (e) => formatCount(e.photoCount),
    },
    {
      key: 'albums',
      header: '앨범 수',
      align: 'right',
      widthClassName: 'w-20',
      render: (e) => formatCount(e.albumCount),
    },
    {
      key: 'lastUploadedAt',
      header: '마지막 업로드',
      align: 'right',
      widthClassName: 'w-32',
      render: (e) => (
        <span className="whitespace-nowrap tabular-nums">{formatDateTime(e.lastUploadedAt)}</span>
      ),
    },
    {
      key: 'publishedAt',
      header: '공개일',
      align: 'right',
      widthClassName: 'w-28',
      render: (e) => formatDate(e.publishedAt),
    },
  ]

  const grantColumns: AdminColumn<AdminPassGrant>[] = [
    {
      key: 'plan',
      header: '기간',
      widthClassName: 'w-20',
      render: (g) => (
        <span className={g.revokedAt ? 'line-through opacity-50' : 'font-medium'}>
          {passPlanLabel(g.plan)}
        </span>
      ),
    },
    {
      key: 'range',
      header: '적용 구간',
      widthClassName: 'w-64',
      render: (g) => (
        <span className={`whitespace-nowrap tabular-nums ${g.revokedAt ? 'line-through opacity-50' : ''}`}>
          {formatDateTime(g.accessFrom)} ~ {formatDateTime(g.accessUntil)}
        </span>
      ),
    },
    {
      key: 'memo',
      header: '메모',
      render: (g) => (
        <div className={`leading-tight ${g.revokedAt ? 'opacity-50' : ''}`}>
          <div>{g.memo}</div>
          <div className="mt-0.5 text-xs text-admin-muted">
            {formatDateTime(g.createdAt)} · 관리자 #{g.adminId}
            {g.adminId === adminUserId ? ' (나)' : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      widthClassName: 'w-28',
      render: (g) =>
        g.revokedAt ? (
          <span className="whitespace-nowrap text-xs text-admin-muted">
            {formatDate(g.revokedAt)} 회수됨
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setRevoking(g)}
            className="h-7 rounded-md border border-admin-border bg-admin-surface px-2.5 text-xs text-admin-muted hover:bg-admin-bg hover:text-admin-text"
          >
            회수
          </button>
        ),
    },
  ]

  // 헤더 사진 수는 상세 응답에 총계 필드가 없어 이벤트 목록에서 파생한다(목록 화면 photoCount와 같은 규칙)
  const photoTotal = detail.data?.events.reduce((sum, e) => sum + e.photoCount, 0) ?? 0

  return (
    <>
      <AdminTopbar
        left={
          <>
            <Link to="/admin/groups" className="font-normal text-admin-muted hover:text-admin-text">
              모임
            </Link>
            <span className="font-normal text-admin-muted">/</span>
            {/* 이름 대신 groupId 표기라 응답을 기다릴 필요가 없다 — URL이 이미 갖고 있다 */}
            <span>{groupLabel(groupId ?? '')}</span>
          </>
        }
        right={detail.data ? `${groupTypeLabel(detail.data.groupType)} 모임` : undefined}
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        {detail.error ? (
          detail.error.status === 404 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-admin-border bg-admin-surface px-5 py-10">
              <p className="text-[13px] text-admin-muted">모임을 찾을 수 없어요.</p>
              <Link
                to="/admin/groups"
                className="h-8 rounded-lg border border-admin-border px-3 text-[13px] leading-8 hover:bg-admin-bg"
              >
                모임 목록으로
              </Link>
            </div>
          ) : (
            <AdminErrorMessage error={detail.error} onRetry={detail.refetch} />
          )
        ) : !detail.data ? (
          <AdminMessage text="불러오는 중이에요…" />
        ) : (
          <>
            <section className="rounded-xl border border-admin-border bg-admin-surface px-5 py-4">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">{groupLabel(detail.data.groupId)}</h1>
                <span className="rounded border border-admin-border px-1.5 py-px text-[11px] text-admin-muted">
                  {groupTypeLabel(detail.data.groupType)}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-admin-muted">
                생성일 <Strong>{formatDate(detail.data.createdAt)}</Strong>
                <Dot /> 멤버 <Strong>{formatCount(detail.data.memberCount)}명</Strong>
                <Dot /> 이벤트 <Strong>{formatCount(detail.data.events.length)}개</Strong>
                <Dot /> 사진 <Strong>{formatCount(photoTotal)}장</Strong>
                {detail.data.ownerNickname ? (
                  <>
                    <Dot /> 생성자 <Strong>{detail.data.ownerNickname}</Strong>
                  </>
                ) : null}
                <Dot /> 마지막 업로드 <Strong>{formatDateTime(detail.data.lastUploadedAt)}</Strong>
              </p>

              {/* ── 과금(CHMO-932) — 이 모임의 업로드를 무엇으로 판정하나 ── */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-admin-border pt-3 text-[13px]">
                <span className="text-admin-muted">
                  과금 범위 <Strong>{billingScopeLabel(detail.data.billingScope)}</Strong>
                  {detail.data.billingOwnerUserId !== null ? (
                    <>
                      <Dot /> 소유자{' '}
                      <Link
                        to={`/admin/users/${detail.data.billingOwnerUserId}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {detail.data.billingOwnerNickname ?? '(지워진 계정)'} #
                        {detail.data.billingOwnerUserId}
                      </Link>
                    </>
                  ) : null}
                </span>

                {detail.data.billingScope === 'PERSONAL' ? (
                  <span className="text-admin-muted">
                    패스{' '}
                    {detail.data.pass.active && detail.data.pass.accessUntil ? (
                      <>
                        <Strong>이용 중</Strong> · {formatDateTime(detail.data.pass.accessUntil)}까지
                      </>
                    ) : (
                      <Strong>없음</Strong>
                    )}
                    <span className="ml-1 text-xs">(패스가 없으면 올리는 사람의 장수가 줄어요)</span>
                  </span>
                ) : null}

                {detail.data.institution ? (
                  <span className="flex items-center gap-1.5 text-admin-muted">
                    기관 이용 <SubscriptionAccessBadge status={detail.data.institution.accessStatus} />
                    {detail.data.institution.accessUntil ? (
                      <span>
                        {accessUntilToKstDate(detail.data.institution.accessUntil)}까지 · 유예 종료{' '}
                        {detail.data.institution.graceEndsAt
                          ? formatDate(detail.data.institution.graceEndsAt)
                          : '—'}
                      </span>
                    ) : (
                      <span>등록된 기간 없음 · 지금 업로드가 막혀요</span>
                    )}
                  </span>
                ) : null}

                <span className="ml-auto flex items-center gap-2">
                  {detail.data.billingScope === 'PERSONAL' ? (
                    <button
                      type="button"
                      onClick={() => setGranting(true)}
                      className="h-8 rounded-lg border border-primary bg-primary px-3 text-[13px] font-semibold text-admin-text hover:brightness-95"
                    >
                      패스 지급
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setChangingScope(true)}
                    disabled={detail.data.billingScope === null}
                    title={
                      detail.data.billingScope === null
                        ? '서버가 과금 범위를 아직 주지 않아요 · BE 배포 뒤 바꿀 수 있어요'
                        : undefined
                    }
                    className="h-8 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text hover:bg-admin-bg disabled:opacity-40"
                  >
                    과금 범위 변경
                  </button>
                </span>
              </div>

              <p className="mt-2 text-xs text-admin-muted">
                🔒 학부모 공유 비밀번호는 어드민에 노출하지 않아요 (admin-spec §3-3)
              </p>
            </section>

            <div className="flex items-start gap-4">
              <section className="w-[380px] shrink-0 rounded-xl border border-admin-border bg-admin-surface">
                <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                  <h2 className="text-[14px] font-semibold">멤버</h2>
                  <span className="text-xs text-admin-muted">
                    {formatCount(detail.data.memberCount)}명
                    {groupType === 'GENERAL' ? ' · 일반 모임은 역할이 없어요' : ''}
                  </span>
                </div>
                <AdminTable
                  columns={memberColumns}
                  rows={detail.data.members}
                  rowKey={(m) => m.userId}
                  emptyText="멤버가 없어요."
                />
              </section>

              <section className="min-w-0 flex-1 rounded-xl border border-admin-border bg-admin-surface">
                <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                  <h2 className="text-[14px] font-semibold">이벤트</h2>
                  <span className="text-xs text-admin-muted">
                    {formatCount(detail.data.events.length)}개 · 최신순
                  </span>
                </div>
                <AdminTable
                  columns={eventColumns}
                  rows={detail.data.events}
                  rowKey={(e) => e.eventId}
                  emptyText="이벤트가 아직 없어요."
                />
              </section>
            </div>

            {detail.data.billingScope === 'PERSONAL' ? (
              <section className="rounded-xl border border-admin-border bg-admin-surface">
                <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
                  <div>
                    <h2 className="text-[14px] font-semibold">패스 지급 이력</h2>
                    <p className="mt-0.5 text-xs text-admin-muted">
                      운영자가 준 패스만 보여요 · 스토어에서 산 이용권은 만료 시각에만 반영돼요
                    </p>
                  </div>
                  <span className="text-xs text-admin-muted">
                    {formatCount(detail.data.pass.grants.length)}건 · 최신순
                  </span>
                </div>
                <AdminTable
                  columns={grantColumns}
                  rows={detail.data.pass.grants}
                  rowKey={(g) => g.grantId}
                  emptyText="아직 지급한 패스가 없어요."
                />
              </section>
            ) : null}
          </>
        )}
      </div>

      {granting && detail.data ? (
        <PassGrantDialog
          groupId={detail.data.groupId}
          currentAccessUntil={detail.data.pass.active ? detail.data.pass.accessUntil : null}
          onClose={() => setGranting(false)}
          onDone={(result) => {
            setGranting(false)
            detail.refetch()
            showToast(
              `${passPlanLabel(result.plan)} 패스를 지급했어요 · ${formatDateTime(result.accessUntil)}까지`,
            )
          }}
        />
      ) : null}

      {changingScope && detail.data && detail.data.billingScope ? (
        <BillingScopeDialog
          groupId={detail.data.groupId}
          current={{
            billingScope: detail.data.billingScope,
            billingOwnerUserId: detail.data.billingOwnerUserId,
          }}
          onClose={() => setChangingScope(false)}
          onDone={(result) => {
            setChangingScope(false)
            detail.refetch()
            showToast(
              `과금 범위를 ${billingScopeLabel(result.billingScope)}(소유자 #${result.billingOwnerUserId})로 바꿨어요`,
            )
          }}
        />
      ) : null}

      {revoking ? (
        <AdminConfirmDialog
          title="이 패스 지급을 회수할까요?"
          lines={[
            `${passPlanLabel(revoking.plan)} · ${formatDateTime(revoking.accessFrom)} ~ ${formatDateTime(revoking.accessUntil)} · ${revoking.memo}`,
            '지급한 기간만큼 패스 만료가 당겨져요 · 이미 지난 시각으로는 줄지 않아요.',
            '이력은 지워지지 않고 회수로 남아요.',
          ]}
          confirmLabel="회수"
          busy={revokeBusy}
          onCancel={() => setRevoking(null)}
          onConfirm={() => void revoke()}
        />
      ) : null}

      {toast ? (
        <AdminToast message={toast.message} nonce={toast.nonce} onDismiss={dismissToast} />
      ) : null}
    </>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-admin-text">{children}</span>
}

function Dot() {
  return <span className="mx-1.5 text-admin-border">·</span>
}
