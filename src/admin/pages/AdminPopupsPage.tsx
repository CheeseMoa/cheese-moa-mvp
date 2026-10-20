import { adminPath } from '../paths'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import { deleteAdminPopup, listAdminPopups, setAdminPopupActive } from '../api/admin'
import type { AdminPopup, AdminPopupStatus } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminConfirmDialog } from '../components/AdminConfirmDialog'
import { AdminToast } from '../components/AdminToast'
import { AdminRowMenu } from '../components/AdminRowMenu'
import { AdminSwitch } from '../components/AdminForm'
import { PopupStatusBadge } from '../components/StatusBadge'
import { Pagination } from '../components/Pagination'
import {
  formatCount,
  formatDateTime,
  formatPeriod,
  linkHost,
  popupAudienceLabel,
  popupLocaleLabel,
} from '../lib/format'

const PAGE_SIZE = 20

/** 행 클릭을 막는 칸 — AdminTable 셀 패딩(px-5 py-3)만큼 넓혀 칸 전체를 덮는다 */
const STOP_CELL = '-mx-5 -my-3 cursor-default px-5 py-3'

/** 탭 = `status` 쿼리 값(생략 = 전체). 상태는 조회 시각 파생값이라 시간이 지나면 탭을 옮겨 다닌다 */
const TABS: { key: string; label: string; status?: AdminPopupStatus; emptyText: string }[] = [
  { key: 'all', label: '전체', emptyText: '아직 만든 팝업이 없어요.' },
  { key: 'live', label: '노출 중', status: 'LIVE', emptyText: '지금 앱에 나가는 팝업이 없어요.' },
  { key: 'scheduled', label: '예정', status: 'SCHEDULED', emptyText: '예정된 팝업이 없어요.' },
  { key: 'ended', label: '종료', status: 'ENDED', emptyText: '기간이 끝난 팝업이 없어요.' },
  { key: 'off', label: '꺼짐', status: 'OFF', emptyText: '꺼 둔 팝업이 없어요.' },
]

/**
 * 켜기/끄기 결과 한 줄 — 켰다고 바로 보이는 게 아니라 **기간**이 함께 정한다. 앱은 홈에 들어갈 때
 * 세션당 한 번 묻기 때문에(CHMO-927) "지금 앱을 열고 있는 사람"에겐 다음 실행부터다.
 */
function toggledMessage(popup: AdminPopup): string {
  if (!popup.active) return '팝업을 껐어요 · 앱을 새로 여는 사람부터 안 보여요.'
  if (popup.status === 'LIVE') return '팝업을 켰어요 · 지금부터 앱을 여는 사람에게 보여요.'
  if (popup.status === 'SCHEDULED') {
    return `팝업을 켰어요 · ${formatDateTime(popup.startsAt)}부터 보여요.`
  }
  return '팝업을 켰지만 기간이 끝나 앱에는 보이지 않아요 · 기간을 고쳐 주세요.'
}

/**
 * 이벤트 팝업 목록 (CHMO-928 — BE CHMO-926) · `/admin/popups`.
 *
 * 앱 업데이트 없이 홈 진입 팝업을 바꾸는 화면이다. 켜기/끄기는 표에서 바로(가장 잦고 되돌리기
 * 쉬운 일), 수정·복제·삭제는 `⋯`로 접는다(기관 문의 행 메뉴와 같은 결 — CHMO-811). 행을 누르면
 * 수정 화면이다.
 *
 * 성공한 켜기/끄기는 응답 행을 **렌더에서 id로 덧씌운다**(재조회 없음 — 신고·문의와 같은 규칙).
 * 필터와 어긋난 행(예: '노출 중' 탭에서 끈 행)도 사라지지 않아 바로 다시 켤 수 있다.
 */
export function AdminPopupsPage() {
  const navigate = useNavigate()
  const [tabKey, setTabKey] = useState(TABS[0].key)
  const [page, setPage] = useState(0)
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0]

  const list = useApi(
    `admin-popups?status=${tab.status ?? ''}&page=${page}&size=${PAGE_SIZE}`,
    (signal) => listAdminPopups({ page, size: PAGE_SIZE, status: tab.status }, signal),
  )

  const [patched, setPatched] = useState<Record<number, AdminPopup>>({})
  useEffect(() => {
    setPatched((prev) => (Object.keys(prev).length > 0 ? {} : prev))
  }, [list.data])
  const rows = (list.data?.items ?? []).map((row) => patched[row.popupId] ?? row)

  const [busyId, setBusyId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<AdminPopup | null>(null)
  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )
  const mutate = useMutation()

  // 작성·수정 화면이 저장 후 돌아오며 남긴 결과 한 줄(navigate state) — 한 번 띄우고 지운다
  // (안 지우면 새로고침·뒤로가기마다 같은 토스트가 다시 뜬다)
  const location = useLocation()
  const arrivedToast = (location.state as { toast?: string } | null)?.toast
  useEffect(() => {
    if (!arrivedToast) return
    showToast(arrivedToast)
    navigate('.', { replace: true, state: null })
  }, [arrivedToast, showToast, navigate])

  // POPUP404 — 다른 관리자가 지웠다. 화면이 든 목록이 낡았다는 뜻이라 안내 후 다시 읽는다
  const onFailure = (message: string, err: unknown) => {
    if (err instanceof ApiRequestError && err.status === 404) {
      showToast('이미 지워진 팝업이에요 · 목록을 다시 불러왔어요.')
      list.refetch()
      return
    }
    showToast(message)
  }

  const toggle = async (popup: AdminPopup, next: boolean) => {
    setBusyId(popup.popupId)
    await mutate(() => setAdminPopupActive(popup.popupId, next), {
      // 401은 서비스 로그인으로 보내지 않는다 — 어드민의 재로그인 표면은 셸 안 카드다(CHMO-594)
      noAuthRedirect: true,
      onSuccess: (updated) => {
        setPatched((prev) => ({ ...prev, [updated.popupId]: updated }))
        setBusyId(null)
        showToast(toggledMessage(updated))
      },
      onError: (message, err) => {
        setBusyId(null)
        onFailure(message, err)
      },
    })
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const target = deleting
    setBusyId(target.popupId)
    await mutate(() => deleteAdminPopup(target.popupId), {
      noAuthRedirect: true,
      onSuccess: () => {
        setDeleting(null)
        setBusyId(null)
        showToast(`'${target.title}' 팝업을 지웠어요.`)
        list.refetch()
      },
      onError: (message, err) => {
        setDeleting(null)
        setBusyId(null)
        onFailure(message, err)
      },
    })
  }

  const columns: AdminColumn<AdminPopup>[] = [
    {
      key: 'image',
      header: '이미지',
      widthClassName: 'w-20',
      render: (p) => (
        <img
          src={p.imageUrl}
          alt=""
          loading="lazy"
          className="h-[50px] w-10 rounded-md border border-admin-border bg-admin-bg object-cover"
        />
      ),
    },
    {
      key: 'title',
      header: '팝업',
      render: (p) => (
        <div className="min-w-0 leading-tight">
          <div className="truncate font-medium">{p.title}</div>
          <div className="mt-0.5 truncate text-xs text-admin-muted" title={p.linkUrl}>
            {p.ctaLabel ? `[${p.ctaLabel}] · ` : ''}
            {linkHost(p.linkUrl)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: '상태',
      widthClassName: 'w-24',
      render: (p) => <PopupStatusBadge status={p.status} />,
    },
    {
      key: 'period',
      header: '기간 (한국 시간)',
      widthClassName: 'w-60',
      render: (p) => (
        <span className="whitespace-nowrap tabular-nums text-admin-muted">
          {formatPeriod(p.startsAt, p.endsAt)}
        </span>
      ),
    },
    {
      key: 'audience',
      header: '대상',
      widthClassName: 'w-28',
      render: (p) => <span className="whitespace-nowrap">{popupAudienceLabel(p.audience)}</span>,
    },
    {
      key: 'locale',
      header: '언어',
      widthClassName: 'w-20',
      render: (p) => popupLocaleLabel(p.locale),
    },
    {
      key: 'priority',
      header: '우선순위',
      align: 'right',
      widthClassName: 'w-24 whitespace-nowrap',
      render: (p) => <span className="tabular-nums">{p.priority}</span>,
    },
    {
      key: 'active',
      header: '켜기',
      widthClassName: 'w-16',
      render: (p) => (
        // 행 클릭(수정 화면)으로 새지 않게 — 스위치는 그 자리에서 끝나는 동작이다. 셀 여백까지
        // 덮는다(음수 마진): 스위치를 살짝 빗겨 누른 손이 수정 화면으로 튀지 않게
        <div className={STOP_CELL} onClick={(e) => e.stopPropagation()}>
          <AdminSwitch
            checked={p.active}
            label={`${p.title} ${p.active ? '끄기' : '켜기'}`}
            disabled={busyId !== null}
            onChange={(next) => void toggle(p, next)}
          />
        </div>
      ),
    },
    {
      key: 'menu',
      header: '',
      widthClassName: 'w-12',
      render: (p, index) => (
        <div className={STOP_CELL} onClick={(e) => e.stopPropagation()}>
          <AdminRowMenu
            label="팝업 더보기"
            disabled={busyId !== null}
            openUp={index >= 3 && index >= rows.length - 2}
            groups={[
              {
                items: [
                  {
                    key: 'edit',
                    label: '수정',
                    onSelect: () => navigate(adminPath(`/popups/${p.popupId}`)),
                  },
                  {
                    key: 'duplicate',
                    label: '복제해서 새로 만들기',
                    onSelect: () => navigate(adminPath(`/popups/new?from=${p.popupId}`)),
                  },
                ],
              },
              { items: [{ key: 'delete', label: '삭제', onSelect: () => setDeleting(p) }] },
            ]}
          />
        </div>
      ),
    },
  ]

  const total = list.data?.pageInfo?.totalElements

  return (
    <>
      <AdminTopbar
        left="이벤트 팝업"
        right={total !== undefined ? `총 ${formatCount(total)}개` : undefined}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-7 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" role="tablist" aria-label="노출 상태 필터">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => list.refetch()}
              className="h-9 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-muted hover:bg-admin-bg hover:text-admin-text"
            >
              새로고침
            </button>
            <Link
              to={adminPath('/popups/new')}
              className="inline-flex h-9 items-center rounded-lg border border-primary bg-primary px-4 text-[13px] font-semibold text-admin-text hover:brightness-95"
            >
              ＋ 새 팝업
            </Link>
          </div>
        </div>

        {/* 상태 이름만으로는 앱에서 무슨 일이 일어나는지 알 수 없다 — 노출 규칙을 한 줄로 */}
        <p className="text-xs text-admin-muted">
          앱은 홈에 들어갈 때 <b className="font-semibold text-admin-text">한 번에 하나만</b> 띄워요
          · 노출 중인 팝업이 여럿이면 우선순위가 높은 것부터 · 앱 2.7.0 이상에서만 보여요.
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
              rowKey={(p) => p.popupId}
              onRowClick={(p) => navigate(adminPath(`/popups/${p.popupId}`))}
              emptyText={tab.emptyText}
              dimmed={list.loading}
            />
            {list.data.pageInfo && list.data.pageInfo.totalPages > 0 ? (
              <div className="border-t border-admin-border">
                <Pagination pageInfo={list.data.pageInfo} rowCount={rows.length} onPage={setPage} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {deleting ? (
        <AdminConfirmDialog
          title={`'${deleting.title}' 팝업을 지울까요?`}
          lines={[
            deleting.status === 'LIVE'
              ? '지금 노출 중이에요. 지우면 앱을 새로 여는 사람부터 안 보여요.'
              : '지우면 목록에서 사라지고 되돌릴 수 없어요.',
            '잠시 멈추기만 할 거라면 지우지 말고 끄기를 쓰세요.',
          ]}
          confirmLabel="지우기"
          busy={busyId !== null}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      ) : null}

      {toast ? (
        <AdminToast message={toast.message} nonce={toast.nonce} onDismiss={dismissToast} />
      ) : null}
    </>
  )
}
