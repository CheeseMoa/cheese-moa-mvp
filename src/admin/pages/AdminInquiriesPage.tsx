import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import { listAdminInquiries, updateAdminInquiryStatus } from '../api/admin'
import type { AdminInquiry, AdminInquiryFilter, AdminInquiryStatus } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminConfirmDialog } from '../components/AdminConfirmDialog'
import { AdminToast } from '../components/AdminToast'
import { InquiryStatusBadge } from '../components/StatusBadge'
import { Pagination } from '../components/Pagination'
import {
  contactRoleLabel,
  formatCount,
  formatDate,
  formatDateTime,
  formatPhone,
  inquiryStatusLabel,
  organizationTypeLabel,
  socialProvidersLabel,
} from '../lib/format'

/** BE 기본값과 같다(1~100 제약) — 페이지 크기 UI는 두지 않는다(모임 목록과 동일) */
const PAGE_SIZE = 20

/** 탭 = `status` 쿼리 값 — 진행 중이 기본이다(BE 기본값과 같아 첫 화면이 곧 처리 대기 목록) */
const TABS: { key: string; label: string; filter: AdminInquiryFilter; emptyText: string }[] = [
  { key: 'open', label: '진행 중', filter: 'RECEIVED,CONTACTED', emptyText: '처리할 문의가 없어요.' },
  { key: 'onboarded', label: '개통', filter: 'ONBOARDED', emptyText: '개통한 문의가 없어요.' },
  { key: 'closed', label: '종료', filter: 'CLOSED', emptyText: '종료한 문의가 없어요.' },
  { key: 'all', label: '전체', filter: 'ALL', emptyText: '아직 들어온 문의가 없어요.' },
]

/**
 * 접수 → 연락 → 개통/종료 순서. 액션 버튼은 여기서 **현재 상태만 뺀 나머지 전부**라,
 * 되돌리기(개통·종료 행 → 접수됨/연락 완료)도 같은 줄에 선다: 전이 규칙이 없으므로
 * 잘못 누른 값을 화면에서 그대로 고칠 수 있어야 한다(BE CHMO-810 결정 — types.ts 주석).
 * 순서를 파이프라인대로 둔 건 버튼 위치가 곧 방향(앞으로 보내기 / 되돌리기)이기 때문이다.
 */
const PIPELINE: AdminInquiryStatus[] = ['RECEIVED', 'CONTACTED', 'ONBOARDED', 'CLOSED']

/** 개통 뒤 사용자 쪽 동작(앱 CHMO-809 승인 대기 화면 규칙) — 운영자가 전화로 알려 줄 말이다 */
const AFTER_ONBOARD_NOTE =
  '사용자는 앱의 [다시 확인]을 누르거나 앱을 다시 열면 시작할 수 있어요.'

interface ConfirmCopy {
  title: string
  lines: string[]
  confirmLabel: string
}

/**
 * 확인을 받을 전이와 그 문구. 확인 여부를 가르는 것은 **사용자 쪽에서 무엇이 달라지는가**다:
 *
 * - `개통` — 그 계정이 앱을 쓰기 시작한다.
 * - **`개통` 상태에서 나가는 전이 전부** — 목적지가 `종료`든 `접수됨`이든 사용자는 똑같이
 *   승인 대기 화면으로 돌아간다. 그래서 '개통 취소' 문구는 목적지가 아니라 출발지로 정한다
 *   (되돌리기만 조용히 나가면, 가장 파괴적으로 보이는 동작에 확인이 없는 셈이 된다).
 * - `종료` — 사용자가 문의를 새로 내야 다시 진행된다.
 *
 * 나머지(연락 완료 표시, 종료분 되돌리기)는 사용자 화면을 바꾸지 않는 운영 메모라 바로 나간다.
 */
function confirmCopyFor(inquiry: AdminInquiry, to: AdminInquiryStatus): ConfirmCopy | null {
  const name = inquiry.organizationName
  if (to === 'ONBOARDED') {
    return {
      title: `'${name}' 계정을 개통할까요?`,
      lines: ['개통하면 이 사용자가 앱에서 모임을 만들고 사진을 올릴 수 있어요.', AFTER_ONBOARD_NOTE],
      confirmLabel: '개통하기',
    }
  }
  if (inquiry.status === 'ONBOARDED') {
    return {
      title: `'${name}' 계정의 개통을 취소할까요?`,
      lines: [
        '이 사용자는 다시 승인 대기 화면으로 돌아가요.',
        '모임과 사진은 그대로 남고, 다시 개통하면 이어서 쓸 수 있어요.',
      ],
      confirmLabel: '개통 취소',
    }
  }
  if (to === 'CLOSED') {
    return {
      title: `'${name}' 문의를 종료할까요?`,
      lines: ['다시 진행하려면 사용자가 문의를 새로 내야 해요.'],
      confirmLabel: '종료하기',
    }
  }
  return null
}

/** 성공 토스트 — 개통만 사용자 쪽 다음 동작을 함께 알린다 */
function successMessage(updated: AdminInquiry): string {
  if (updated.status === 'ONBOARDED') return `개통했어요 · ${AFTER_ONBOARD_NOTE}`
  return `'${inquiryStatusLabel(updated.status)}' 상태로 바꿨어요.`
}

/**
 * 기관 도입 문의 (CHMO-811 — BE CHMO-810) · `/admin/inquiries`.
 * 어드민의 첫 운영(쓰기) 화면 — 지금까지 BE 개발자의 SQL이던 개통을 운영자가 여기서 한다.
 * 전이 이력(누가·언제·from/to)은 CloudWatch 액세스 로그가 정본이라(ADR 017) 화면에는
 * 마지막 전이 시각(`updatedAt`)만 둔다.
 */
export function AdminInquiriesPage() {
  const [tabKey, setTabKey] = useState(TABS[0].key)
  const [page, setPage] = useState(0)
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0]

  const list = useApi(`admin-inquiries?status=${tab.filter}&page=${page}&size=${PAGE_SIZE}`, (signal) =>
    listAdminInquiries({ page, size: PAGE_SIZE, status: tab.filter }, signal),
  )

  /**
   * 전이에 성공한 행 — id로 목록 위에 덧씌운다(PATCH 응답이 목록 행과 같은 형태라 재조회가
   * 필요 없다). 응답을 **state로 복사하지 않고** 렌더에서 겹치는 이유는 캐시 때문이다:
   * 탭을 되돌아오면 useApi가 캐시 값을 첫 렌더부터 주는데, 복사본을 effect로 맞추면 그 한
   * 프레임 동안 이전 탭의 행이 새 탭 아래에 그려진다.
   *
   * 필터와 어긋나게 된 행도 그 자리에 남긴다 — 방금 누른 행이 사라지면 잘못 누른 값을
   * 되돌릴 대상이 화면에서 없어진다. 다음 조회(탭·페이지 이동·[새로고침])에서 빠진다.
   */
  const [patched, setPatched] = useState<Record<number, AdminInquiry>>({})
  useEffect(() => {
    // 새 응답이 왔으면 덧씌울 것도 없다(같은 id면 값도 같다) — 비어 있으면 그대로 둬 헛렌더를 막는다
    setPatched((prev) => (Object.keys(prev).length > 0 ? {} : prev))
  }, [list.data])
  const rows = (list.data?.items ?? []).map((row) => patched[row.id] ?? row)

  const [pending, setPending] = useState<{ inquiry: AdminInquiry; to: AdminInquiryStatus } | null>(
    null,
  )
  const [busyId, setBusyId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )

  const mutate = useMutation()

  const commit = async (inquiry: AdminInquiry, to: AdminInquiryStatus) => {
    setBusyId(inquiry.id)
    await mutate(() => updateAdminInquiryStatus(inquiry.id, to), {
      // 401을 서비스 로그인(/login)으로 보내지 않는다 — 어드민의 재로그인 표면은 어드민 셸
      // 안의 로그인 카드다(CHMO-594). 여기서는 메시지만 알리고 화면을 지킨다.
      noAuthRedirect: true,
      onSuccess: (updated) => {
        setPatched((prev) => ({ ...prev, [updated.id]: updated }))
        setPending(null)
        setBusyId(null)
        showToast(successMessage(updated))
      },
      onError: (message, err) => {
        setPending(null)
        setBusyId(null)
        const code = err instanceof ApiRequestError ? err.code : ''
        const status = err instanceof ApiRequestError ? err.status : 0
        // 둘 다 "화면이 든 목록이 이미 낡았다"는 뜻이라 안내 후 다시 읽는다
        if (code === 'OPEN_INQUIRY_EXISTS') {
          showToast('이 사용자에게 진행 중인 문의가 이미 있어요 · 목록을 다시 불러왔어요.')
          list.refetch()
          return
        }
        if (status === 404) {
          showToast('이미 없는 문의예요 · 목록을 다시 불러왔어요.')
          list.refetch()
          return
        }
        showToast(message)
      },
    })
  }

  const requestTransition = (inquiry: AdminInquiry, to: AdminInquiryStatus) => {
    if (confirmCopyFor(inquiry, to)) setPending({ inquiry, to })
    else void commit(inquiry, to)
  }

  const columns: AdminColumn<AdminInquiry>[] = [
    {
      key: 'createdAt',
      header: '접수일',
      widthClassName: 'w-28',
      render: (i) => formatDate(i.createdAt),
    },
    {
      key: 'organization',
      header: '기관',
      render: (i) => (
        <div className="leading-tight">
          <div className="font-medium">{i.organizationName}</div>
          <div className="mt-0.5 text-xs text-admin-muted">
            {organizationTypeLabel(i.organizationType)} · {i.region}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: '담당자',
      widthClassName: 'w-28',
      render: (i) => (
        <div className="leading-tight">
          <div>{i.contactName}</div>
          <div className="mt-0.5 text-xs text-admin-muted">{contactRoleLabel(i.contactRole)}</div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: '연락처',
      widthClassName: 'w-36',
      // 마스킹하지 않는다 — 팀이 전화하려고 받은 값이고 이 화면은 관리자 전용이다(CHMO-802)
      render: (i) => (
        <a href={`tel:${i.contactPhone}`} className="text-accent hover:underline">
          {formatPhone(i.contactPhone)}
        </a>
      ),
    },
    {
      key: 'user',
      header: '사용자',
      widthClassName: 'w-40',
      render: (i) => (
        <div className="leading-tight">
          <div>{i.userNickname}</div>
          <div className="mt-0.5 text-xs text-admin-muted">
            #{i.userId} · {socialProvidersLabel(i.socialProviders)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: '상태',
      widthClassName: 'w-24',
      render: (i) => <InquiryStatusBadge status={i.status} />,
    },
    {
      key: 'updatedAt',
      header: '갱신일',
      align: 'right',
      widthClassName: 'w-36',
      render: (i) => formatDateTime(i.updatedAt),
    },
    {
      key: 'actions',
      header: '상태 변경',
      widthClassName: 'w-64',
      render: (i) => (
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE.filter((to) => to !== i.status).map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => requestTransition(i, to)}
              disabled={busyId !== null}
              className={`h-7 whitespace-nowrap rounded-md border px-2 text-xs disabled:opacity-40 ${
                to === 'ONBOARDED'
                  ? 'border-primary bg-primary font-semibold text-admin-text hover:brightness-95'
                  : 'border-admin-border bg-admin-surface text-admin-muted hover:bg-admin-bg hover:text-admin-text'
              }`}
            >
              {inquiryStatusLabel(to)}
            </button>
          ))}
        </div>
      ),
    },
  ]

  const total = list.data?.pageInfo?.totalElements

  return (
    <>
      <AdminTopbar
        left="기관 문의"
        right={total !== undefined ? `총 ${formatCount(total)}건` : undefined}
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1" role="tablist" aria-label="문의 상태 필터">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === tabKey}
                onClick={() => {
                  setTabKey(t.key)
                  setPage(0)
                }}
                className={`h-9 rounded-lg border px-3 text-[13px] ${
                  t.key === tabKey
                    ? 'border-primary bg-primary font-semibold text-admin-text'
                    : 'border-admin-border bg-admin-surface text-admin-muted hover:bg-admin-bg hover:text-admin-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={list.refetch}
            className="h-9 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-muted hover:bg-admin-bg hover:text-admin-text"
          >
            새로고침
          </button>
        </div>

        {list.error ? (
          <AdminErrorMessage error={list.error} onRetry={list.refetch} />
        ) : !list.data ? (
          <AdminMessage text="불러오는 중이에요…" />
        ) : (
          <div className="rounded-xl border border-admin-border bg-admin-surface">
            <AdminTable
              columns={columns}
              rows={rows}
              rowKey={(i) => i.id}
              emptyText={tab.emptyText}
              dimmed={list.loading}
            />
            {list.data.pageInfo && list.data.pageInfo.totalPages > 0 ? (
              <div className="border-t border-admin-border">
                <Pagination
                  pageInfo={list.data.pageInfo}
                  rowCount={rows.length}
                  onPage={setPage}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {pending
        ? (() => {
            const copy = confirmCopyFor(pending.inquiry, pending.to)
            if (!copy) return null
            return (
              <AdminConfirmDialog
                title={copy.title}
                lines={copy.lines}
                confirmLabel={copy.confirmLabel}
                busy={busyId !== null}
                onCancel={() => setPending(null)}
                onConfirm={() => void commit(pending.inquiry, pending.to)}
              />
            )
          })()
        : null}

      {toast ? (
        <AdminToast message={toast.message} nonce={toast.nonce} onDismiss={dismissToast} />
      ) : null}
    </>
  )
}
