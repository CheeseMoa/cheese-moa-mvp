import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useAlive } from '../../hooks/useAlive'
import { useMutation } from '../../hooks/useMutation'
import {
  cancelAdminCampaign,
  createAdminCampaign,
  getAdminCampaignRecipients,
  listAdminCampaigns,
  testAdminCampaign,
} from '../api/admin'
import type { AdminCampaign, AdminCampaignInput, AdminCampaignRecipients } from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminTable, type AdminColumn } from '../components/AdminTable'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminConfirmDialog } from '../components/AdminConfirmDialog'
import { AdminToast } from '../components/AdminToast'
import { ChoiceGroup, Field, FormSection } from '../components/AdminForm'
import { CampaignStatusBadge } from '../components/StatusBadge'
import { PushNotificationPreview } from '../components/PushNotificationPreview'
import { Pagination } from '../components/Pagination'
import { useAdminOutlet } from '../outletContext'
import {
  campaignFailureLabel,
  formatCount,
  formatDateTime,
  isCampaignInFlight,
  linkHost,
} from '../lib/format'
import { inputClassName, textareaClassName } from '../lib/formStyles'
import {
  CAMPAIGN_LIMITS,
  adTitle,
  campaignPayloadBytes,
  createIdempotencyKeeper,
  dateToKstInput,
  isCampaignDaytime,
  isHttpsLink,
  kstInputToIso,
  nextCampaignDaytime,
} from '../lib/promotion'

const PAGE_SIZE = 20

/** 결과가 나지 않은 이력이 있는 동안 다시 읽는 간격 — BE 디스패처 주기(5초)와 같다 */
const POLL_MS = 5000

type SendMode = 'now' | 'schedule'

/**
 * 이 어드민이 붙은 서버 — 혜택 푸시 토픽은 **서버 환경 설정**이 정한다(BE CHMO-875·926 AC-12).
 * 같은 화면이라도 스테이징 어드민에서 보내면 스테이징 기기에만 간다. 빌드 설정에서 읽는다:
 * 개발 프로젝트(dev.cheese-moa.com)는 스테이징 오리진을 직통으로 부른다(CHMO-573).
 */
function serverLabel(): string {
  if (import.meta.env.VITE_ENABLE_MSW === 'true') return '목(MSW)'
  return /staging/.test(import.meta.env.VITE_API_ORIGIN ?? '') ? '스테이징' : '운영'
}

/** 야간 판정용 시계 — 화면을 열어 둔 채 21시를 넘기면 [지금 보내기]가 스스로 잠긴다 */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/**
 * 혜택 푸시 발송 (CHMO-928 — BE CHMO-926 B절) · `/admin/push`.
 *
 * Firebase 콘솔에서 손으로 보내던 혜택·이벤트 알림(앱 release-guide §10)을 대신한다. 법 요건
 * (`(광고)` 접두사·수신 거부 문구·야간 금지)은 서버가 강제하고, 화면은 같은 규칙으로 **보내기 전에**
 * 최종 모습을 보여 주고 야간을 막는다(admin/lib/promotion).
 *
 * 두 갈래: [테스트 발송](지정 사용자 기기로만 — 기본 대상은 내 계정)과 전체 발송(지금·예약). 전체
 * 발송은 확인 창이 **그 자리에서 대상 수를 다시 센다** — 화면을 오래 열어 둔 사이 동의자가 바뀐다.
 *
 * 접수(202)는 발송 성공이 아니다 — 결과는 이력의 상태로 보고, 결과가 날 때까지 이력을 다시 읽는다.
 */
export function AdminPushPage() {
  const { adminUserId } = useAdminOutlet()
  const alive = useAlive()
  const mutate = useMutation()
  const now = useNow(30_000)
  const server = serverLabel()

  // ── 작성 ──
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [mode, setMode] = useState<SendMode>('now')
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [testUserId, setTestUserId] = useState(String(adminUserId || ''))
  const [touched, setTouched] = useState(false)

  const input: AdminCampaignInput = { title, body, link: link.trim() || null }
  const payloadBytes = campaignPayloadBytes(input)
  const contentErrors = {
    title: !title.trim()
      ? '제목을 적어 주세요.'
      : title.length > CAMPAIGN_LIMITS.title
        ? '100자 이하로 줄여 주세요.'
        : null,
    body: !body.trim()
      ? '본문을 적어 주세요.'
      : body.length > CAMPAIGN_LIMITS.body
        ? '1,000자 이하로 줄여 주세요.'
        : payloadBytes > CAMPAIGN_LIMITS.payloadBytes
          ? `자동 문구까지 합쳐 알림이 너무 커요(${formatCount(payloadBytes)} / ${formatCount(CAMPAIGN_LIMITS.payloadBytes)}바이트) · 본문을 줄여 주세요.`
          : null,
    link:
      link.trim() && !isHttpsLink(link.trim())
        ? 'https://로 시작하는 웹 주소만 쓸 수 있어요.'
        : null,
  }
  const contentValid = !contentErrors.title && !contentErrors.body && !contentErrors.link
  const showError = (message: string | null) => (touched ? message : null)

  const daytimeNow = isCampaignDaytime(new Date(now))
  const scheduledIso = mode === 'schedule' ? kstInputToIso(scheduledLocal) : null
  const scheduleError =
    mode !== 'schedule'
      ? null
      : !scheduledIso
        ? '보낼 시각을 골라 주세요.'
        : new Date(scheduledIso).getTime() <= now
          ? '이미 지난 시각이에요.'
          : !isCampaignDaytime(new Date(scheduledIso))
            ? '21:00~08:00(한국 시간)은 고를 수 없어요.'
            : null
  const sendBlockedReason =
    mode === 'now' && !daytimeNow
      ? '지금은 야간(21:00~08:00)이라 바로 보낼 수 없어요.'
      : scheduleError

  const testId = Number(testUserId)
  const testIdValid = Number.isInteger(testId) && testId > 0

  // ── 대상 수 ──
  const recipients = useApi('admin-campaign-recipients', (signal) =>
    getAdminCampaignRecipients(signal),
  )

  // ── 이력 ──
  const [page, setPage] = useState(0)
  const history = useApi(`admin-campaigns?page=${page}&size=${PAGE_SIZE}`, (signal) =>
    listAdminCampaigns({ page, size: PAGE_SIZE }, signal),
  )
  const [patched, setPatched] = useState<Record<number, AdminCampaign>>({})
  useEffect(() => {
    setPatched((prev) => (Object.keys(prev).length > 0 ? {} : prev))
  }, [history.data])
  const rows = (history.data?.items ?? []).map((row) => patched[row.campaignId] ?? row)

  // 결과를 기다리는 행(대기 중·보내는 중·만기 지난 예약)이 보이는 동안 몇 초마다 다시 읽는다
  const waiting = rows.some(
    (row) =>
      isCampaignInFlight(row.status) ||
      (row.status === 'SCHEDULED' &&
        row.scheduledAt !== null &&
        new Date(row.scheduledAt).getTime() <= now),
  )
  const historyRefetch = history.refetch
  useEffect(() => {
    if (!waiting || !history.data) return
    const timer = window.setTimeout(historyRefetch, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [waiting, history.data, historyRefetch])

  // ── 토스트 ──
  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = useCallback(
    (message: string) => setToast((prev) => ({ message, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  )

  /** 같은 발송의 재시도에만 같은 키 — 테스트·전체는 서로 다른 요청이라 키도 따로다 */
  const sendKeys = useRef(createIdempotencyKeeper())
  const testKeys = useRef(createIdempotencyKeeper())

  // ── 테스트 발송 ──
  const [testing, setTesting] = useState(false)
  const sendTest = async () => {
    setTouched(true)
    if (!contentValid || !testIdValid || !daytimeNow) return
    setTesting(true)
    const key = testKeys.current.keyFor(JSON.stringify({ input, testId }))
    await mutate(() => testAdminCampaign(input, testId, key), {
      noAuthRedirect: true,
      onSuccess: (created) => {
        testKeys.current.reset()
        setTesting(false)
        setPatched((prev) => ({ ...prev, [created.campaignId]: created }))
        history.refetch()
        showToast(`테스트를 접수했어요 · #${testId} 기기로 몇 초 안에 가요.`)
      },
      onError: (message, err) => {
        setTesting(false)
        if (err instanceof ApiRequestError && err.code === 'INVALID_CAMPAIGN') {
          showToast(
            `#${testId}에게 보낼 수 없어요 · 등록된 기기가 없거나 혜택·이벤트 알림 수신에 동의하지 않았어요.`,
          )
          return
        }
        showToast(message)
      },
    })
  }

  // ── 전체 발송 ──
  const [confirming, setConfirming] = useState(false)
  const [freshRecipients, setFreshRecipients] = useState<AdminCampaignRecipients | null>(null)
  const [recountFailed, setRecountFailed] = useState(false)
  const [sending, setSending] = useState(false)

  const openConfirm = async () => {
    setTouched(true)
    if (!contentValid || sendBlockedReason) return
    setConfirming(true)
    setFreshRecipients(null)
    setRecountFailed(false)
    // 확인 창이 그 자리에서 다시 센다 — 화면을 연 뒤 바뀐 동의·기기를 반영한다(티켓 AC)
    try {
      const counted = await getAdminCampaignRecipients()
      if (alive.current) setFreshRecipients(counted)
    } catch {
      if (alive.current) setRecountFailed(true)
    }
  }

  const send = async () => {
    const scheduledAt = mode === 'schedule' ? scheduledIso : null
    setSending(true)
    const key = sendKeys.current.keyFor(JSON.stringify({ input, scheduledAt }))
    await mutate(() => createAdminCampaign(input, scheduledAt, key), {
      noAuthRedirect: true,
      onSuccess: (created) => {
        sendKeys.current.reset()
        setSending(false)
        setConfirming(false)
        // 같은 글을 두 번 보내지 않게 작성칸을 비운다(테스트 대상은 남긴다)
        setTitle('')
        setBody('')
        setLink('')
        setMode('now')
        setScheduledLocal('')
        setTouched(false)
        setPatched((prev) => ({ ...prev, [created.campaignId]: created }))
        setPage(0)
        history.refetch()
        showToast(
          scheduledAt
            ? `${formatDateTime(scheduledAt)}에 보내도록 예약했어요 · 보내기 전까지 이력에서 취소할 수 있어요.`
            : '보내기를 접수했어요 · 몇 초 안에 보내고 아래 이력에서 결과를 볼 수 있어요.',
        )
      },
      onError: (message, err) => {
        setSending(false)
        setConfirming(false)
        const code = err instanceof ApiRequestError ? err.code : ''
        if (code === 'INVALID_CAMPAIGN') {
          showToast(
            scheduledAt
              ? '예약 시각이 지났거나 야간이에요 · 시각을 다시 골라 주세요.'
              : '지금은 보낼 수 없어요 · 야간이거나 링크·길이가 서버 규칙에 맞지 않아요.',
          )
          return
        }
        if (code === 'CAMPAIGN_CONFLICT') {
          sendKeys.current.reset()
          showToast('이미 처리된 요청이에요 · 아래 이력을 확인해 주세요.')
          history.refetch()
          return
        }
        showToast(message)
      },
    })
  }

  const scheduleNextMorning = () => {
    setMode('schedule')
    setScheduledLocal(dateToKstInput(nextCampaignDaytime(new Date(now))))
  }

  // ── 예약 취소 ──
  const [cancelling, setCancelling] = useState<AdminCampaign | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const cancel = async () => {
    if (!cancelling) return
    const target = cancelling
    setCancelBusy(true)
    await mutate(() => cancelAdminCampaign(target.campaignId), {
      noAuthRedirect: true,
      onSuccess: (updated) => {
        setCancelBusy(false)
        setCancelling(null)
        setPatched((prev) => ({ ...prev, [updated.campaignId]: updated }))
        showToast('예약을 취소했어요 · 보내지 않아요.')
      },
      onError: (message, err) => {
        setCancelBusy(false)
        setCancelling(null)
        if (err instanceof ApiRequestError && err.code === 'CAMPAIGN_CONFLICT') {
          showToast('이미 보내기 시작해 취소할 수 없어요 · 이력을 다시 불러왔어요.')
          history.refetch()
          return
        }
        showToast(message)
      },
    })
  }

  const columns = useMemo<AdminColumn<AdminCampaign>[]>(
    () => [
      {
        key: 'createdAt',
        header: '접수',
        widthClassName: 'w-36',
        render: (c) => (
          <span className="whitespace-nowrap tabular-nums text-admin-muted">
            {formatDateTime(c.createdAt)}
          </span>
        ),
      },
      {
        key: 'content',
        header: '내용',
        render: (c) => (
          <div className="min-w-0 leading-snug">
            <p className="truncate font-medium">{c.title}</p>
            <p className="truncate text-xs text-admin-muted">
              {c.body.split('\n')[0]}
              {c.link ? ` · ${linkHost(c.link)}` : ''}
            </p>
          </div>
        ),
      },
      {
        key: 'target',
        header: '대상',
        widthClassName: 'w-32',
        render: (c) =>
          c.testUserId !== null ? (
            <span className="whitespace-nowrap">
              테스트 · #{c.testUserId}
              {c.testUserId === adminUserId ? ' (나)' : ''}
            </span>
          ) : (
            <span className="whitespace-nowrap">동의자 전체</span>
          ),
      },
      {
        key: 'when',
        header: '보낸·보낼 시각',
        widthClassName: 'w-36',
        render: (c) => (
          <span className="whitespace-nowrap tabular-nums">
            {c.sentAt
              ? formatDateTime(c.sentAt)
              : c.scheduledAt
                ? `${formatDateTime(c.scheduledAt)} 예약`
                : '—'}
          </span>
        ),
      },
      {
        key: 'status',
        header: '상태',
        widthClassName: 'w-44',
        render: (c) => (
          <div className="leading-tight">
            <CampaignStatusBadge status={c.status} />
            {campaignFailureLabel(c.failureCode) ? (
              <p className="mt-1 text-xs text-admin-muted">{campaignFailureLabel(c.failureCode)}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'author',
        header: '작성자',
        widthClassName: 'w-24',
        render: (c) => (
          <span className="whitespace-nowrap text-admin-muted">
            #{c.createdBy}
            {c.createdBy === adminUserId ? ' (나)' : ''}
          </span>
        ),
      },
      {
        key: 'action',
        header: '',
        widthClassName: 'w-24',
        render: (c) =>
          c.status === 'SCHEDULED' ? (
            <button
              type="button"
              onClick={() => setCancelling(c)}
              className="h-7 whitespace-nowrap rounded-md border border-admin-border bg-admin-surface px-2.5 text-xs text-admin-text hover:bg-admin-bg"
            >
              예약 취소
            </button>
          ) : null,
      },
    ],
    [adminUserId],
  )

  const finalTitle = title.trim() ? adTitle(title) : ''

  return (
    <>
      <AdminTopbar left="혜택 푸시" right={`${server} 서버`} />
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-7 py-6">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
          <div className="min-w-0 max-w-[640px] flex-1 space-y-4">
            <FormSection
              title="보낼 내용"
              description="혜택·이벤트 알림 수신에 동의한 사람에게만 가요 · 지금은 한국어 한 벌만 보내요."
            >
              <Field
                label="제목"
                htmlFor="push-title"
                error={showError(contentErrors.title)}
                hint="앞에 (광고)가 자동으로 붙어요 · 직접 쓰지 않아도 돼요."
                count={{ value: title.length, max: CAMPAIGN_LIMITS.title }}
              >
                <input
                  id="push-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예) 설문 참여 혜택"
                  className={inputClassName(Boolean(showError(contentErrors.title)))}
                />
              </Field>
              <Field
                label="본문"
                htmlFor="push-body"
                error={showError(contentErrors.body)}
                hint="끝에 전송자·수신 거부 문구가 자동으로 붙어요."
                count={{ value: body.length, max: CAMPAIGN_LIMITS.body }}
              >
                <textarea
                  id="push-body"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="예) 치즈모아를 쓰며 느낀 점을 들려주세요. 참여하면 커피 기프티콘을 드려요."
                  className={textareaClassName(Boolean(showError(contentErrors.body)))}
                />
              </Field>
              <Field
                label="링크"
                htmlFor="push-link"
                optional
                error={contentErrors.link}
                hint="누르면 외부 브라우저로 열려요 · 비우면 앱만 열려요."
              >
                <input
                  id="push-link"
                  type="url"
                  inputMode="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://forms.gle/…"
                  className={inputClassName(Boolean(contentErrors.link))}
                />
              </Field>
            </FormSection>

            <FormSection
              title="테스트 발송"
              description="전체에 보내기 전에 내 기기로 먼저 받아 보세요 · 토픽을 거치지 않고 그 사용자 기기로만 가요."
            >
              <div className="flex items-end gap-2">
                <div className="w-48">
                  <Field label="사용자 ID" htmlFor="push-test-user">
                    <input
                      id="push-test-user"
                      inputMode="numeric"
                      value={testUserId}
                      onChange={(e) => setTestUserId(e.target.value.replace(/\D/g, ''))}
                      className={inputClassName(touched && !testIdValid)}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => void sendTest()}
                  disabled={testing || !daytimeNow}
                  className="h-10 rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] font-semibold text-admin-text hover:bg-admin-bg disabled:opacity-50"
                >
                  {testing ? '접수 중…' : '테스트 발송'}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-admin-muted">
                {daytimeNow
                  ? `기본값은 내 계정(#${adminUserId})이에요 · 그 사용자도 혜택·이벤트 알림 수신에 동의하고 알림을 켜 둬야 받아요.`
                  : '테스트도 야간(21:00~08:00)에는 보낼 수 없어요.'}
              </p>
            </FormSection>

            <FormSection title="보내기">
              <ChoiceGroup<SendMode>
                label="발송 방식"
                value={mode}
                choices={[
                  { value: 'now', label: '지금 보내기' },
                  { value: 'schedule', label: '예약하기' },
                ]}
                onChange={setMode}
              />
              {mode === 'schedule' ? (
                <div className="w-72">
                  <Field
                    label="보낼 시각 (한국 시간)"
                    htmlFor="push-scheduled"
                    error={scheduledLocal ? scheduleError : null}
                  >
                    <input
                      id="push-scheduled"
                      type="datetime-local"
                      value={scheduledLocal}
                      min={dateToKstInput(new Date(now))}
                      onChange={(e) => setScheduledLocal(e.target.value)}
                      className={inputClassName(Boolean(scheduledLocal && scheduleError))}
                    />
                  </Field>
                </div>
              ) : null}
              <p className="text-xs leading-relaxed text-admin-muted">
                21:00~08:00(한국 시간)에는 보낼 수 없어요 · 정보통신망법 야간 광고 전송 제한이라 서버가
                막아요.
                {mode === 'now' && !daytimeNow ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={scheduleNextMorning}
                      className="font-semibold text-admin-text underline underline-offset-2"
                    >
                      다음 08:00으로 예약하기
                    </button>
                  </>
                ) : null}
              </p>
              <div className="flex items-center justify-end gap-3 border-t border-admin-border pt-4">
                {sendBlockedReason && (mode === 'now' || scheduledLocal) ? (
                  <p className="text-xs text-admin-muted">{sendBlockedReason}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void openConfirm()}
                  disabled={sending || Boolean(sendBlockedReason)}
                  className="h-10 rounded-lg border border-primary bg-primary px-5 text-[13px] font-semibold text-admin-text hover:brightness-95 disabled:opacity-50"
                >
                  {mode === 'now' ? '지금 보내기' : '예약하기'}
                </button>
              </div>
            </FormSection>
          </div>

          <aside className="w-[340px] shrink-0 space-y-4 xl:sticky xl:top-0">
            <div className="rounded-xl border border-admin-border bg-admin-surface px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-admin-muted">받는 사람</p>
                <button
                  type="button"
                  onClick={() => recipients.refetch()}
                  className="text-xs text-admin-muted hover:text-admin-text hover:underline"
                >
                  새로 세기
                </button>
              </div>
              <p className="mt-1 text-[20px] font-bold tabular-nums">
                {recipients.data
                  ? `동의자 ${formatCount(recipients.data.userCount)}명 · 기기 ${formatCount(recipients.data.deviceCount)}대`
                  : recipients.error
                    ? '세지 못했어요'
                    : '세는 중…'}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-admin-muted">
                혜택·이벤트 알림에 동의하고 알림을 켜 둔 사람 기준이라 실제 받는 기기 수와 잠시 다를 수
                있어요.
              </p>
              <p className="mt-2 rounded-lg bg-admin-bg px-3 py-2 text-xs leading-relaxed text-admin-text">
                지금 <b className="font-semibold">{server}</b> 서버예요 · 스테이징 어드민에서 보내면
                스테이징 기기에만 가요.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-admin-muted">기기에서 이렇게 보여요</p>
              <PushNotificationPreview title={title} body={body} link={input.link} />
            </div>
          </aside>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">발송 이력</h2>
            <button
              type="button"
              onClick={() => history.refetch()}
              className="h-8 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-muted hover:bg-admin-bg hover:text-admin-text"
            >
              새로고침
            </button>
          </div>
          <p className="text-xs text-admin-muted">
            접수는 발송 성공이 아니에요 · <b className="font-semibold text-admin-text">실패</b>·
            <b className="font-semibold text-admin-text">일부 실패</b>·
            <b className="font-semibold text-admin-text">결과 확인 필요</b>는 자동으로 다시 보내지 않아요
            (결과 확인 필요는 이미 일부가 도착했을 수 있어요) · 확인한 뒤 새로 보내 주세요.
          </p>
          {history.error ? (
            <AdminErrorMessage error={history.error} onRetry={history.refetch} />
          ) : !history.data ? (
            <AdminMessage text="불러오는 중이에요…" />
          ) : (
            <div className="rounded-xl border border-admin-border bg-admin-surface">
              <AdminTable
                columns={columns}
                rows={rows}
                rowKey={(c) => c.campaignId}
                emptyText="아직 보낸 혜택 푸시가 없어요."
                dimmed={history.loading && !waiting}
              />
              {history.data.pageInfo && history.data.pageInfo.totalPages > 0 ? (
                <div className="border-t border-admin-border">
                  <Pagination pageInfo={history.data.pageInfo} rowCount={rows.length} onPage={setPage} />
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {confirming ? (
        <AdminConfirmDialog
          title={
            mode === 'now'
              ? '지금 보낼까요?'
              : `${formatDateTime(scheduledIso)}에 보내도록 예약할까요?`
          }
          lines={[
            freshRecipients
              ? `${server} 서버 · 지금 기준 동의자 ${formatCount(freshRecipients.userCount)}명 · 기기 ${formatCount(freshRecipients.deviceCount)}대에게 가요.`
              : recountFailed
                ? '받는 사람 수를 다시 세지 못했어요 · 닫고 다시 시도해 주세요.'
                : '받는 사람 수를 다시 세는 중이에요…',
            `제목: ${finalTitle}`,
            mode === 'now'
              ? '보낸 뒤에는 취소할 수 없어요.'
              : '보내기 전까지 아래 이력에서 예약을 취소할 수 있어요 · 받는 사람은 보내는 시점의 동의자예요.',
          ]}
          confirmLabel={mode === 'now' ? '보내기' : '예약하기'}
          busy={sending}
          confirmDisabled={!freshRecipients}
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      {cancelling ? (
        <AdminConfirmDialog
          title="예약을 취소할까요?"
          lines={[
            `${formatDateTime(cancelling.scheduledAt)} 예정이던 '${cancelling.title}'이(가) 나가지 않아요.`,
            '취소한 예약은 되살릴 수 없어요 · 다시 보내려면 새로 예약해 주세요.',
          ]}
          confirmLabel="예약 취소하기"
          cancelLabel="그대로 두기"
          busy={cancelBusy}
          onConfirm={() => void cancel()}
          onCancel={() => setCancelling(null)}
        />
      ) : null}

      {toast ? (
        <AdminToast message={toast.message} nonce={toast.nonce} onDismiss={dismissToast} />
      ) : null}
    </>
  )
}
