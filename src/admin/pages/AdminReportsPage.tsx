import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { listAdminReports } from '../api/admin'
import type { AdminReportRow, AdminReportStatusFilter, AdminReportTypeFilter } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminToast } from '../components/AdminToast'
import { ReportDetailPanel } from '../components/ReportDetailPanel'
import { ReportStatusBadge, ReportTypeBadge } from '../components/StatusBadge'
import { Pagination } from '../components/Pagination'
import {
  formatCount,
  formatDateTime,
  formatMonthDayTime,
  groupLabel,
  socialProvidersLabel,
} from '../lib/format'
import { useAdminOutlet } from '../outletContext'

/** BE 기본값과 같다(1~100 제약) — 페이지 크기 UI는 두지 않는다(모임·기관 문의 목록과 동일) */
const PAGE_SIZE = 20

/** 탭 = `status` 쿼리 값. 처리 대기가 기본이다(BE 기본값과 같아 첫 화면이 곧 할 일 목록) */
const STATUS_TABS: {
  key: string
  label: string
  filter: AdminReportStatusFilter
  emptyText: string
}[] = [
  {
    key: 'pending',
    label: '처리 대기',
    filter: 'RECEIVED,IN_PROGRESS',
    emptyText: '처리할 신고·문의가 없어요.',
  },
  {
    key: 'answered',
    label: '답변 완료',
    filter: 'ANSWERED',
    emptyText: '답변한 신고·문의가 없어요.',
  },
  { key: 'closed', label: '종료', filter: 'CLOSED', emptyText: '종료한 신고·문의가 없어요.' },
  { key: 'all', label: '전체', filter: 'ALL', emptyText: '아직 들어온 신고·문의가 없어요.' },
]

/**
 * 유형 필터 = `type` 쿼리 값. `신고만`이 둘째 자리인 이유: 삭제 요청·부적절 신고는 사진이 걸린 일이라
 * 문의보다 먼저 처리해야 하고, 그것만 모아 보는 게 가장 잦은 필터다.
 */
const TYPE_FILTERS: { key: string; label: string; filter: AdminReportTypeFilter }[] = [
  { key: 'all', label: '전체', filter: 'ALL' },
  { key: 'reports', label: '신고만', filter: 'DELETION_REQUEST,INAPPROPRIATE' },
  { key: 'app', label: '앱 오류', filter: 'APP_ERROR' },
  { key: 'classification', label: '사진 분류', filter: 'CLASSIFICATION' },
  { key: 'account', label: '계정·참여', filter: 'ACCOUNT' },
  { key: 'other', label: '제안·기타', filter: 'OTHER' },
]

/** 상세 패널이 연 건 — URL에 두어 새로고침·주소 공유에도 같은 건이 열린다 */
const SELECTED_PARAM = 'id'

/**
 * 신고·문의 (CHMO-862 — BE CHMO-861) · `/admin/reports`.
 *
 * 사용자에게 이메일이 없어서(소셜·PIN 가입) **팀의 답은 이 화면에서 쓰는 답변이 유일한 경로**다 —
 * 답변은 사용자 앱의 [신고·문의]에 서고 첫 답변은 푸시로 알린다. 목록에서 한 건을 누르면 오른쪽
 * 곁 패널이 열리고, 목록은 가려지지 않아 다음 건을 바로 누를 수 있다.
 *
 * 답변·전이 이력(누가·언제)은 CloudWatch 액세스 로그가 정본이라(BE ADR 017) 화면에는 마지막
 * 답변 시각·답한 관리자 id만 둔다.
 */
export function AdminReportsPage() {
  const { refreshPendingReports } = useAdminOutlet()
  const [tabKey, setTabKey] = useState(STATUS_TABS[0].key)
  const [typeKey, setTypeKey] = useState(TYPE_FILTERS[0].key)
  const [page, setPage] = useState(0)
  const tab = STATUS_TABS.find((t) => t.key === tabKey) ?? STATUS_TABS[0]
  const typeFilter = TYPE_FILTERS.find((t) => t.key === typeKey) ?? TYPE_FILTERS[0]

  const list = useApi(
    `admin-reports?status=${tab.filter}&type=${typeFilter.filter}&page=${page}&size=${PAGE_SIZE}`,
    (signal) =>
      listAdminReports(
        {
          page,
          size: PAGE_SIZE,
          status: tab.filter,
          // 전체는 BE 기본값(ALL)이라 싣지 않는다 — 요청 URL을 기본 조합일 때 짧게 둔다
          type: typeFilter.filter === 'ALL' ? undefined : typeFilter.filter,
        },
        signal,
      ),
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = Number(searchParams.get(SELECTED_PARAM)) || null
  // replace — 행을 훑을 때마다 히스토리가 쌓이면 뒤로가기가 지나온 건을 하나씩 되짚는다
  const select = useCallback(
    (id: number | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id === null) next.delete(SELECTED_PARAM)
          else next.set(SELECTED_PARAM, String(id))
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  /**
   * 답변·전이에 성공한 행 — id로 목록 위에 덧씌운다(기관 문의와 같은 규칙). 응답을 state로 복사하지
   * 않고 렌더에서 겹치는 건 캐시 때문이고(탭을 되돌아오면 useApi가 캐시 값을 첫 렌더부터 준다),
   * 필터와 어긋나게 된 행도 남기는 건 방금 손댄 건이 목록에서 사라지면 되돌릴 대상을 잃어서다 —
   * 다음 조회(탭·필터·페이지 이동·[새로고침])에서 빠진다.
   */
  const [patched, setPatched] = useState<Record<number, AdminReportRow>>({})
  useEffect(() => {
    setPatched((prev) => (Object.keys(prev).length > 0 ? {} : prev))
  }, [list.data])
  const rows = (list.data?.items ?? []).map((row) => patched[row.id] ?? row)

  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )

  const onRowUpdated = useCallback(
    (row: AdminReportRow) => {
      setPatched((prev) => ({ ...prev, [row.id]: row }))
      // 답변·전이는 처리 대기 수를 바꾼다 — 사이드바 배지를 바로 맞춘다
      refreshPendingReports()
    },
    [refreshPendingReports],
  )

  // REPORT404 — 사용자가 계정을 지우면 신고·문의도 함께 사라진다. 화면이 든 목록이 낡았다는 뜻
  const listRefetch = list.refetch
  const onGone = useCallback(() => {
    showToast('이미 없는 신고·문의예요 · 목록을 다시 불러왔어요.')
    select(null)
    listRefetch()
    refreshPendingReports()
  }, [showToast, select, listRefetch, refreshPendingReports])

  const changeTab = (key: string) => {
    setTabKey(key)
    setPage(0)
  }
  const changeType = (key: string) => {
    setTypeKey(key)
    setPage(0)
  }

  // 패널이 열리면 표가 좁아진다 — 사용자·답변 시각 칸을 접고 시각에서 연도를 뗀다(전부 패널에 있다)
  const compact = selectedId !== null

  const columns: AdminColumn<AdminReportRow>[] = [
    {
      key: 'createdAt',
      header: '접수',
      widthClassName: compact ? 'w-28' : 'w-36',
      render: (r) => (
        <span className="whitespace-nowrap tabular-nums text-admin-muted">
          {compact ? formatMonthDayTime(r.createdAt) : formatDateTime(r.createdAt)}
        </span>
      ),
    },
    {
      key: 'type',
      header: '유형',
      widthClassName: 'w-24',
      render: (r) => <ReportTypeBadge type={r.type} />,
    },
    {
      key: 'content',
      header: '내용',
      render: (r) => <ContentCell row={r} />,
    },
    ...(compact
      ? []
      : [
          {
            key: 'user',
            header: '사용자',
            widthClassName: 'w-40',
            render: (r: AdminReportRow) => (
              <div className="leading-tight">
                <div>{r.userNickname ?? '(알 수 없음)'}</div>
                <div className="mt-0.5 text-xs text-admin-muted">
                  #{r.userId} · {socialProvidersLabel(r.socialProviders)}
                </div>
              </div>
            ),
          },
        ]),
    {
      key: 'status',
      header: '상태',
      widthClassName: 'w-24',
      render: (r) => <ReportStatusBadge status={r.status} />,
    },
    ...(compact
      ? []
      : [
          {
            key: 'answeredAt',
            header: '답변',
            align: 'right' as const,
            widthClassName: 'w-36',
            render: (r: AdminReportRow) => (
              <span className="whitespace-nowrap tabular-nums">{formatDateTime(r.answeredAt)}</span>
            ),
          },
        ]),
  ]

  const total = list.data?.pageInfo?.totalElements

  return (
    <>
      <AdminTopbar
        left="신고·문의"
        right={total !== undefined ? `총 ${formatCount(total)}건` : undefined}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto px-7 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1" role="tablist" aria-label="처리 상태 필터">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={t.key === tabKey}
                  onClick={() => changeTab(t.key)}
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
              onClick={() => {
                // 새 신고는 앱에서 들어온다 — 목록을 다시 읽으면 배지도 같은 수를 말해야 한다
                list.refetch()
                refreshPendingReports()
              }}
              className="h-9 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-muted hover:bg-admin-bg hover:text-admin-text"
            >
              새로고침
            </button>
          </div>

          {/* 유형은 상태 탭보다 한 단계 약한 칩 — 탭이 "무엇을 할 차례인가", 칩이 "그중 어떤 것" */}
          <div className="flex flex-wrap items-center gap-1.5" aria-label="유형 필터">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={t.key === typeKey}
                onClick={() => changeType(t.key)}
                className={`h-7 rounded-full border px-3 text-xs ${
                  t.key === typeKey
                    ? 'border-admin-text bg-admin-text font-medium text-white'
                    : 'border-admin-border bg-admin-surface text-admin-muted hover:bg-admin-bg hover:text-admin-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 상태 이름만으로는 무엇이 달라지는지 알 수 없다 — 답변의 뜻을 화면이 한 줄로 말한다 */}
          <p className="text-xs text-admin-muted">
            처리 대기는 접수됨 · 확인 중이에요.{' '}
            <b className="font-semibold text-admin-text">답변</b>을 보내면 답변 완료가 되고 사용자
            앱에 답이 서요.
          </p>

          {list.error ? (
            <AdminErrorMessage error={list.error} onRetry={list.refetch} />
          ) : !list.data ? (
            <AdminMessage text="불러오는 중이에요…" />
          ) : (
            <div className="rounded-xl border border-admin-border bg-admin-surface">
              <AdminTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                onRowClick={(r) => select(r.id)}
                isRowSelected={(r) => r.id === selectedId}
                // 유형을 좁혔는데 "아직 들어온 게 없다"고 하면 사실이 아니다 — 필터 탓임을 말한다
                emptyText={
                  typeFilter.filter === 'ALL'
                    ? tab.emptyText
                    : `'${typeFilter.label}' 유형은 이 목록에 없어요.`
                }
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

        {selectedId !== null ? (
          <ReportDetailPanel
            key={selectedId}
            reportId={selectedId}
            onClose={() => select(null)}
            onSelect={select}
            onRowUpdated={onRowUpdated}
            onGone={onGone}
            showToast={showToast}
          />
        ) : null}
      </div>

      {toast ? (
        <AdminToast
          message={toast.message}
          nonce={toast.nonce}
          onDismiss={dismissToast}
          // 우측 하단은 상세 패널의 [답변 보내기] 자리라 토스트가 버튼을 가린다 — 목록 쪽 가운데로
          placement={selectedId !== null ? 'center' : 'right'}
        />
      ) : null}
    </>
  )
}

/**
 * 내용 칸 — 첫 줄은 내용 앞부분(최대 2줄), 둘째 줄은 무엇에 관한 건인지.
 * 사진 신고는 내용 없이 접수될 수 있고 목록 행엔 이벤트명이 없어(상세에만 있다) `[사진] 모임`까지만
 * 말한다 — 어느 사진인지는 패널이 보여 준다.
 */
function ContentCell({ row }: { row: AdminReportRow }) {
  const group =
    row.groupId === null ? null : (row.groupName ?? `${groupLabel(row.groupId)} (지워진 모임)`)
  const context = [
    row.photoId !== null ? `[사진]${group ? ` ${group}` : ''}` : group,
    row.hasAttachments ? '첨부 있음' : null,
  ].filter(Boolean)

  return (
    <div className="min-w-0 leading-snug">
      <p className={`line-clamp-2 break-words ${row.preview ? '' : 'text-admin-muted'}`}>
        {row.preview ?? '(내용 없이 사유만 골라 접수)'}
      </p>
      {context.length > 0 ? (
        <p className="mt-0.5 truncate text-xs text-admin-muted">{context.join(' · ')}</p>
      ) : null}
    </div>
  )
}
