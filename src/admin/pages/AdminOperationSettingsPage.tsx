import { adminPath } from '../paths'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useBlocker } from 'react-router-dom'
import { ApiRequestError, redirectIfUnauthorized } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useMutation'
import { invalidateApiCacheKey } from '../../lib/apiCache'
import {
  changeOperationSettings,
  saveAndReloadSettings,
  getAttendanceSettings,
  getAttendanceStatistics,
  getOperationSettings,
  getSettingsHistory,
  restoreSettings,
  updateAttendanceSettings,
  type AttendanceSettings,
  type OperationSettings,
  type SettingsHistory,
  type Snapshot,
} from '../api/operationSettings'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import { AdminDialog, AdminDialogActions } from '../components/AdminDialog'
import { AdminNotice, FormSection } from '../components/AdminForm'
import { inputClassName, textareaClassName } from '../lib/formStyles'
import { formatDateTime } from '../lib/format'
import {
  attendanceDisplay,
  attendancePayloadError,
  buildChanges,
  changedFields,
  fields,
  sections,
  toDraft,
  hasQuestSettings,
  hasSubscriptionSettings,
  subscriptionImpact,
  missingHistoryPolicies,
  missingPolicyMessage,
  restorePreview,
  questImpact,
  restoreCompatibilityError,
  settingsEnvironmentLabel,
  settingsErrors,
  settingDisplay,
  type SettingsSection,
} from '../lib/operationSettings'

const button =
  'min-h-10 rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] hover:bg-admin-bg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const primary = `${button} border-primary bg-primary font-semibold`
type Tab = SettingsSection | 'history' | 'limits'
type Pending = { kind: 'save' } | { kind: 'restore'; item: SettingsHistory; snapshot: Snapshot }
const environment = settingsEnvironmentLabel(
  import.meta.env.VITE_API_ORIGIN,
  import.meta.env.VITE_ENABLE_MSW === 'true',
)

export function AdminOperationSettingsPage() {
  const navigate = useNavigate()
  const mutate = useMutation()
  // 편집 기준은 진입마다 재조회한다. 공유 캐시의 이전 revision을 채택하지 않는다.
  const instanceId = useId()
  const readKey = `admin-operation-settings:${instanceId}`
  const request = useApi(readKey, getOperationSettings)
  useEffect(() => () => invalidateApiCacheKey(readKey), [readKey])
  const [baseline, setBaseline] = useState<OperationSettings | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Tab>('app')
  const [nextTab, setNextTab] = useState<Tab | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState('')
  const [conflict, setConflict] = useState(false)
  const [reloadConfirm, setReloadConfirm] = useState(false)
  const errorSummary = useRef<HTMLDivElement>(null)
  const [showErrors, setShowErrors] = useState(false)
  const section = sections.find((s) => s.key === tab)
  const changes = baseline && section ? changedFields(baseline.settings, draft, section.key) : []
  const dirty = changes.length > 0
  const blocker = useBlocker(dirty || busy)
  const errors = baseline && section ? settingsErrors(baseline.settings, draft, section.key) : []
  const payloadError = tab === 'attendancePush' && baseline ? attendancePayloadError(draft) : null
  const history = useApi(tab === 'history' ? 'admin-operation-settings-history' : null, (signal) =>
    getSettingsHistory(undefined, signal),
  )
  const [older, setOlder] = useState<SettingsHistory[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState('')
  // 첫 페이지가 새로 도착하면 이전 커서의 목록은 같은 스냅샷으로 볼 수 없다.
  const historyHead = useRef(history.data)
  historyHead.current = history.data
  useEffect(() => {
    setOlder([])
    setCursor(null)
  }, [history.data])
  const [historyDetail, setHistoryDetail] = useState<SettingsHistory | null>(null)
  const attendance = useApi(
    tab === 'attendancePush' ? 'admin-attendance-settings' : null,
    getAttendanceSettings,
  )

  useEffect(() => {
    if (!baseline && request.data) {
      setBaseline(request.data)
      setDraft(toDraft(request.data.settings))
    }
  }, [baseline, request.data])
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])
  useEffect(() => {
    for (const error of [request.error, history.error, attendance.error])
      if (error) redirectIfUnauthorized(error, navigate, { to: adminPath() })
  }, [request.error, history.error, attendance.error, navigate])
  useEffect(() => {
    if (showErrors && (errors.length || payloadError)) errorSummary.current?.focus()
  }, [showErrors, errors.length, payloadError])

  function switchTab(next: Tab) {
    if (next === tab) return
    if (dirty) {
      setNextTab(next)
      return
    }
    setTab(next)
    setShowErrors(false)
    setMessage('')
  }
  async function reload() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    await mutate(() => getOperationSettings(), {
      onSuccess: (value) => {
        setBaseline(value)
        setDraft(toDraft(value.settings))
        setConflict(false)
        setShowErrors(false)
        setMessage('최신 설정을 불러왔어요.')
        setBusy(false)
        busyRef.current = false
        attendance.refetch()
      },
      onError: (msg) => {
        setMessage(msg)
        setBusy(false)
        busyRef.current = false
      },
    })
  }
  const restoreTarget =
    pending?.kind === 'restore'
      ? pending.snapshot === 'BEFORE'
        ? pending.item.before
        : pending.item.after
      : null
  const restoreError =
    pending?.kind === 'restore' && baseline
      ? restoreCompatibilityError(
          baseline.settings,
          pending.snapshot === 'BEFORE' ? pending.item.before : pending.item.after,
        )
      : null
  async function save() {
    if (
      restoreError ||
      busyRef.current ||
      !baseline ||
      !pending ||
      conflict ||
      !acknowledged ||
      !reason.trim() ||
      reason.trim().length > 500 ||
      (pending.kind === 'save' && (errors.length > 0 || Boolean(payloadError)))
    )
      return
    busyRef.current = true
    setBusy(true)
    setMessage('')
    const action = pending
    // 쓰기 성공 후 재조회 실패는 저장 실패와 구분한다. 중복 저장을 허용하지 않는다.
    await mutate(
      () =>
        saveAndReloadSettings(async () => {
          if (action.kind === 'restore')
            await restoreSettings(
              action.item.historyId,
              baseline.revision,
              reason.trim(),
              action.snapshot,
            )
          else if (tab === 'attendancePush') {
            if (!attendance.data || attendance.data.etag !== `"${baseline.revision}"`)
              throw new ApiRequestError(409, 'SETTINGS409', '최신 설정을 다시 조회해 주세요.')
            const settings: AttendanceSettings = {
              enabled: draft['attendancePush.enabled'] === 'true',
              sendTime: draft['attendancePush.sendTime'],
              copy: Object.fromEntries(
                (['ko', 'en', 'ja'] as const).map((locale) => [
                  locale,
                  {
                    title: draft[`attendancePush.copy.${locale}.title`],
                    body: draft[`attendancePush.copy.${locale}.body`],
                  },
                ]),
              ) as AttendanceSettings['copy'],
            }
            await updateAttendanceSettings(settings, attendance.data.etag, reason.trim())
          } else if (section)
            await changeOperationSettings(
              baseline.revision,
              reason.trim(),
              buildChanges(baseline.settings, draft, section.key),
            )
        }),
      {
        onSuccess: ({ value, refreshError }) => {
          const refreshFailed = value === null
          if (value) {
            setBaseline(value)
            setDraft(toDraft(value.settings))
          }
          setConflict(refreshFailed)
          setPending(null)
          setReason('')
          setAcknowledged(false)
          setShowErrors(false)
          setMessage(
            refreshFailed
              ? '저장은 완료됐지만 재조회하지 못했어요. 다시 저장하지 말고 최신 설정을 조회하세요.'
              : '저장 후 서버 설정을 다시 확인했어요.',
          )
          history.refetch()
          attendance.refetch()
          setOlder([])
          setCursor(null)
          busyRef.current = false
          setBusy(false)
          if (refreshError) redirectIfUnauthorized(refreshError, navigate, { to: adminPath() })
        },
        onError: (msg, error) => {
          const code = error instanceof ApiRequestError ? error.code : ''
          setConflict(code === 'SETTINGS409')
          setMessage(
            code === 'SETTINGS409'
              ? '다른 운영자가 설정을 변경했어요. 입력을 보존했어요. 최신 설정을 조회하고 다시 검토하세요.'
              : code === 'SETTINGS503'
                ? '서버에서 운영 설정 쓰기를 잠갔어요. 입력은 보존돼요.'
                : msg,
          )
          setPending(null)
          busyRef.current = false
          setBusy(false)
        },
      },
    )
  }
  async function moreHistory() {
    const next = cursor ?? history.data?.nextCursor
    if (next == null || historyBusy) return
    const expectedHead = historyHead.current
    setHistoryBusy(true)
    setHistoryError('')
    await mutate(() => getSettingsHistory(next), {
      onSuccess: (page) => {
        if (historyHead.current !== expectedHead) {
          setHistoryBusy(false)
          return
        }
        setOlder((items) => [...items, ...page.items])
        setCursor(page.nextCursor)
        setHistoryBusy(false)
      },
      onError: (msg) => {
        setHistoryError(msg)
        setHistoryBusy(false)
      },
    })
  }
  // useMutation이 언마운트 후 UI 갱신을 차단한다. 동기 중복 방지는 busyRef가 담당한다.
  if (!baseline)
    return (
      <>
        <AdminTopbar left="운영 설정" right={environment} />
        <div className="p-6">
          {request.error ? (
            <AdminErrorMessage error={request.error} onRetry={request.refetch} />
          ) : (
            <AdminMessage text="현재 운영 설정을 조회하고 있어요…" />
          )}
        </div>
      </>
    )
  const activeFields = fields.filter((f) => f.path.startsWith(`${tab}.`))
  const questUnavailable = tab === 'quest' && !hasQuestSettings(baseline.settings)
  const subscriptionUnavailable =
    tab === 'institutionSubscription' && !hasSubscriptionSettings(baseline.settings)
  const policyUnavailable = questUnavailable || subscriptionUnavailable
  const compatibilityLocked = (path: string) =>
    path === 'credit.dailyGrant' || path === 'credit.cap'
  const attendanceStale =
    tab === 'attendancePush' &&
    (!attendance.data || attendance.data.etag !== `"${baseline.revision}"`)
  return (
    <>
      <AdminTopbar left="운영 설정" right={environment} />
      <div className="mx-auto max-w-6xl space-y-5 px-7 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">서비스 운영 설정</h1>
            <p className="mt-1 text-xs text-admin-muted">
              revision {baseline.revision} · 마지막 변경 {formatDateTime(baseline.updatedAt)}
              {dirty ? ' · 미저장 변경 있음' : ''}
            </p>
          </div>
          <button
            className={button}
            disabled={busy}
            onClick={() => (dirty ? setReloadConfirm(true) : void reload())}
          >
            최신 설정 조회
          </button>
        </div>
        {message && (
          <div
            role="status"
            className="rounded-lg border border-admin-border bg-admin-surface p-4 text-sm"
          >
            {message}
          </div>
        )}
        {conflict && (
          <AdminNotice
            title="최신 설정 확인이 필요해요"
            lines={[
              '현재 입력은 보존했어요. 내용을 기록한 뒤 최신 설정을 조회하면 입력을 서버 값으로 교체해요. 자동으로 덮어쓰거나 재시도하지 않아요.',
            ]}
          />
        )}
        <nav aria-label="운영 설정 구분" className="flex flex-wrap gap-2">
          {[
            ...sections.map((s) => ({ key: s.key, label: s.label })),
            { key: 'limits' as const, label: '안전 상한·바로가기' },
            { key: 'history' as const, label: '변경 이력' },
          ].map((s) => (
            <button
              key={s.key}
              className={`${button} ${tab === s.key ? 'border-primary bg-admin-nav font-semibold' : ''}`}
              aria-current={tab === s.key ? 'page' : undefined}
              onClick={() => switchTab(s.key)}
              disabled={busy}
            >
              {s.label}
            </button>
          ))}
        </nav>
        {section && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setShowErrors(true)
              if (errors.length || payloadError) errorSummary.current?.focus()
              if (!errors.length && !payloadError && dirty) {
                setPending({ kind: 'save' })
                setAcknowledged(false)
              }
            }}
          >
            <FormSection title={section.label} description={section.description}>
              {tab === 'quest' && <AdminNotice title="퀘스트 적용 범위" lines={questImpact} />}
              {tab === 'institutionSubscription' && (
                <AdminNotice title="월 구독 적용 범위" lines={subscriptionImpact} />
              )}
              {policyUnavailable && (
                <AdminNotice
                  title={`${questUnavailable ? '퀘스트' : '월 구독'} 설정을 확인할 수 없어요`}
                  lines={[
                    '서버에서 이 설정 전체를 제공하지 않았어요. 기본값으로 채우지 않고 편집을 잠갔어요. 서버 업데이트 후 최신 설정을 조회해 주세요.',
                  ]}
                />
              )}
              {tab === 'credit' && (
                <AdminNotice
                  lines={[
                    `고정 가입자 기준일: ${baseline.settings.credit.migrationCutoffAt ? formatDateTime(baseline.settings.credit.migrationCutoffAt) : '없음 (모든 계정에 신규 가입 정책 적용)'} · 편집·복원으로 바뀌지 않아요.`,
                    '차감 시작일이 미래여도 출석 API는 사용할 수 있어요. 비우면 장수·출석 API가 비활성화되며 업로드 차감 판정은 DISABLED가 돼요.',
                    ...baseline.readOnly.appCompatibilityNotes,
                  ]}
                />
              )}
              {showErrors && (errors.length > 0 || payloadError) && (
                <div
                  ref={errorSummary}
                  tabIndex={-1}
                  role="alert"
                  className="rounded-lg border border-warn p-3 text-sm text-warn"
                >
                  <p>입력값을 확인해 주세요.</p>
                  {errors.map((e) => (
                    <a className="block underline" key={e.path} href={`#${e.path}`}>
                      {e.label}: {e.error}
                    </a>
                  ))}
                  {payloadError && <p>{payloadError}</p>}
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2">
                {activeFields.map((f) => {
                  const error = showErrors ? errors.find((e) => e.path === f.path)?.error : null
                  const disabled = busy || policyUnavailable || compatibilityLocked(f.path)
                  return (
                    <div key={f.path} className={f.kind === 'body' ? 'md:col-span-2' : ''}>
                      <label htmlFor={f.path} className="mb-1.5 block text-[13px] font-semibold">
                        {f.label}
                      </label>
                      {f.kind === 'boolean' ? (
                        <select
                          id={f.path}
                          value={draft[f.path]}
                          disabled={disabled}
                          className={inputClassName(Boolean(error))}
                          aria-invalid={Boolean(error)}
                          aria-describedby={`${f.path}-hint`}
                          onChange={(e) => setDraft({ ...draft, [f.path]: e.target.value })}
                        >
                          {draft[f.path] === '' && <option value="">조회되지 않음</option>}
                          <option value="false">비활성</option>
                          <option value="true">활성</option>
                        </select>
                      ) : f.kind === 'body' ? (
                        <textarea
                          id={f.path}
                          rows={3}
                          disabled={disabled}
                          value={draft[f.path]}
                          className={textareaClassName(Boolean(error))}
                          aria-invalid={Boolean(error)}
                          aria-describedby={`${f.path}-hint`}
                          onChange={(e) => setDraft({ ...draft, [f.path]: e.target.value })}
                        />
                      ) : (
                        <input
                          id={f.path}
                          type={
                            f.kind === 'datetime'
                              ? 'datetime-local'
                              : f.kind === 'time'
                                ? 'time'
                                : 'text'
                          }
                          step={f.kind === 'datetime' ? 1 : undefined}
                          inputMode={
                            f.kind === 'amount' || f.kind === 'reward' || f.kind === 'days'
                              ? 'numeric'
                              : undefined
                          }
                          disabled={disabled}
                          value={draft[f.path]}
                          className={inputClassName(Boolean(error))}
                          aria-invalid={Boolean(error)}
                          aria-describedby={`${f.path}-hint`}
                          onChange={(e) => setDraft({ ...draft, [f.path]: e.target.value })}
                        />
                      )}
                      <p
                        id={`${f.path}-hint`}
                        className={`mt-1 text-xs leading-relaxed ${error ? 'text-warn' : 'text-admin-muted'}`}
                      >
                        {error || f.hint}
                      </p>
                    </div>
                  )
                })}
              </div>
              {tab === 'attendancePush' && (
                <>
                  {attendance.error && (
                    <AdminErrorMessage error={attendance.error} onRetry={attendance.refetch} />
                  )}
                  {!attendance.error && attendanceStale && (
                    <p role="status" className="text-sm text-admin-muted">
                      {attendance.loading
                        ? '출석 설정의 변경 버전을 확인하고 있어요.'
                        : '다른 운영자가 설정을 변경했어요. 상단에서 최신 설정을 다시 조회해 주세요.'}
                    </p>
                  )}
                  <div className="grid gap-3 lg:grid-cols-3">
                    {(['ko', 'en', 'ja'] as const).map((locale) => {
                      const copy = attendanceDisplay(
                        locale,
                        draft[`attendancePush.copy.${locale}.title`],
                        draft[`attendancePush.copy.${locale}.body`],
                      )
                      return (
                        <div
                          key={locale}
                          className="rounded-xl border border-admin-border bg-admin-bg p-4"
                        >
                          <p className="mb-2 text-xs text-admin-muted">
                            {locale} 알림 미리보기 · 누르면 앱을 열어요
                          </p>
                          <p className="break-words text-sm font-semibold">{copy.title}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs">
                            {copy.body}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              <div className="flex items-center justify-between border-t border-admin-border pt-4">
                <p className="text-xs text-admin-muted">
                  {dirty
                    ? `${changes.length}개 항목 변경 · 아직 저장하지 않았어요`
                    : '변경사항이 없어요'}
                </p>
                <button
                  type="submit"
                  className={primary}
                  disabled={!dirty || busy || conflict || attendanceStale || policyUnavailable}
                >
                  변경 내용 확인
                </button>
              </div>
            </FormSection>
          </form>
        )}
        {tab === 'attendancePush' && <AttendanceStats />}
        {tab === 'limits' && (
          <FormSection
            title="업로드 안전 상한"
            description="앱 호환성과 처리 용량 검토가 필요한 코드 고정값이에요. 이 화면에서는 조회만 해요."
          >
            <dl className="grid gap-4 sm:grid-cols-3">
              {Object.entries(baseline.readOnly.uploadLimits).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-admin-muted">
                    {{ perRequest: '요청당', perEvent: '이벤트당', perGroup: '모임당' }[key]}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">{value.toLocaleString()}장</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-4 text-sm underline">
              {[
                ['users', '사용자별 장수 지급·회수'],
                ['organizations', '기관 이용 기간'],
                ['groups', '모임 패스'],
                ['popups', '이벤트 팝업'],
                ['push', '혜택 푸시'],
              ].map(([path, label]) => (
                <Link key={path} to={adminPath(`/${path}`)}>
                  {label}
                </Link>
              ))}
            </div>
          </FormSection>
        )}
        {tab === 'history' && (
          <FormSection
            title="변경 이력"
            description="복원은 현재 검증을 거치는 새 변경이에요. 이미 지급한 장수·발송·체험은 되돌리지 않아요."
          >
            {history.error ? (
              <AdminErrorMessage error={history.error} onRetry={history.refetch} />
            ) : !history.data ? (
              <AdminMessage text="변경 이력을 불러오고 있어요…" />
            ) : (
              <>
                {[...history.data.items, ...older].length === 0 && (
                  <p className="text-sm text-admin-muted">기록된 변경이 없어요.</p>
                )}
                {[...history.data.items, ...older].map((item) => (
                  <article
                    key={item.historyId}
                    className="space-y-3 rounded-lg border border-admin-border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        revision {item.revision} · 운영자 #{item.actorUserId} ·{' '}
                        {formatDateTime(item.changedAt)}
                      </p>
                      <button className={button} onClick={() => setHistoryDetail(item)}>
                        전후 값 보기
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p>
                    <p className="text-xs text-admin-muted">
                      적용 범위: 전체 서비스
                      {item.restoredFrom ? ` · 이력 #${item.restoredFrom} 복원` : ''}
                    </p>
                    <div className="flex gap-2">
                      {(['BEFORE', 'AFTER'] as const).map((snapshot) => (
                        <button
                          key={snapshot}
                          className={button}
                          onClick={() => {
                            setPending({ kind: 'restore', item, snapshot })
                            setAcknowledged(false)
                          }}
                        >
                          이 {snapshot === 'BEFORE' ? '변경 전' : '변경 후'} 값 복원 검토
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                {historyError && (
                  <p role="alert" className="text-sm text-warn">
                    {historyError}
                  </p>
                )}
                {(cursor !== null || (older.length === 0 && history.data.hasNext)) && (
                  <button
                    className={button}
                    disabled={historyBusy}
                    onClick={() => void moreHistory()}
                  >
                    {historyBusy ? '조회 중…' : '이전 이력 더 보기'}
                  </button>
                )}
              </>
            )}
          </FormSection>
        )}
      </div>
      {historyDetail && (
        <AdminDialog
          title={`revision ${historyDetail.revision} 변경 전후`}
          onClose={() => setHistoryDetail(null)}
          widthClassName="max-w-3xl"
          footer={
            <button className={button} onClick={() => setHistoryDetail(null)}>
              닫기
            </button>
          }
        >
          <SettingsDiff before={historyDetail.before} after={historyDetail.after} historical />
        </AdminDialog>
      )}
      {pending && (
        <AdminDialog
          title={pending.kind === 'save' ? '운영 설정 변경 확인' : '이전 설정 복원 확인'}
          onClose={() => setPending(null)}
          busy={busy}
          widthClassName="max-w-3xl"
          footer={
            <AdminDialogActions
              confirmLabel={pending.kind === 'save' ? '설정 저장' : '새 변경으로 복원'}
              onCancel={() => setPending(null)}
              onConfirm={() => void save()}
              busy={busy}
              confirmDisabled={
                Boolean(restoreError) ||
                !reason.trim() ||
                reason.trim().length > 500 ||
                !acknowledged ||
                conflict
              }
            />
          }
        >
          {pending.kind === 'save' ? (
            <div className="space-y-2">
              {changes.map((f) => (
                <p key={f.path} className="break-words text-sm">
                  <strong>{f.label}</strong>:{' '}
                  {settingDisplay(f, toDraft(baseline.settings)[f.path])} →{' '}
                  {settingDisplay(f, draft[f.path])}
                </p>
              ))}
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm">
                이력 #{pending.item.historyId}의{' '}
                {pending.snapshot === 'BEFORE' ? '변경 전' : '변경 후'} 전체 설정을 적용해요. 고정
                가입자 기준일과 이력에 기록되지 않은 새 정책은 현재 값을 유지해요.
              </p>
              <SettingsDiff
                before={baseline.settings}
                after={restorePreview(baseline.settings, restoreTarget!)}
              />
            </>
          )}
          <div className="my-4">
            {(tab === 'quest' || pending.kind === 'restore') && (
              <AdminNotice title="퀘스트 보상 적용" lines={questImpact} />
            )}
            {(tab === 'institutionSubscription' || pending.kind === 'restore') && (
              <AdminNotice title="월 구독 적용 범위" lines={subscriptionImpact} />
            )}
            {restoreTarget && missingHistoryPolicies(restoreTarget).length > 0 && (
              <AdminNotice
                title="이력에 없는 정책"
                lines={missingHistoryPolicies(restoreTarget).map(
                  (label) => `${label}: ${missingPolicyMessage}`,
                )}
              />
            )}
            {(pending.kind === 'restore' ||
              (tab !== 'quest' && tab !== 'institutionSubscription')) && (
              <AdminNotice
                title="설정 변경의 적용 범위"
                lines={[
                  '앱 버전은 해당 스토어에 실제 공개됐는지 확인하고 근거를 사유에 남겨 주세요.',
                  '최초 장부 지급은 기존 잔액을 재설정하지 않아요. 출석 상한을 낮춰도 기존 잔액은 삭감하지 않아요.',
                  '유예는 실제 기관 이용 종료일에 현재 기간을 더해 즉시 계산해요. 기존 만료 기관의 접근도 달라질 수 있어요.',
                  '차감 시작일을 비우면 장수·출석 API와 차감 판정이 비활성화돼요. 고정 가입자 기준일은 보존돼요.',
                  '출석 발송 시각이 지난 뒤 21시 전에 활성화하면 당일 다음 주기에 발송될 수 있어요.',
                  '복원은 이미 발생한 지급·발송·체험 효과를 취소하지 않아요.',
                ]}
              />
            )}
          </div>
          <label htmlFor="settings-reason" className="text-sm font-semibold">
            변경 사유 (1~500자)
          </label>
          <textarea
            id="settings-reason"
            autoFocus
            value={reason}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            className={`${textareaClassName()} mt-2`}
            rows={3}
          />
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={busy}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            {pending.kind === 'save' && tab === 'quest'
              ? '변경 전후 값·신규 참여자 적용·중단 및 재개 영향을 확인했어요.'
              : pending.kind === 'save' && tab === 'institutionSubscription'
                ? '변경 전후 값·신규 구매 조건·기존 구독 유지와 출시 준비 조건을 확인했어요.'
                : '변경 전후 값·스토어 공개 상태·적용 범위와 영향을 확인했어요.'}
          </label>
          {restoreError && (
            <p role="alert" className="mt-2 text-sm text-warn">
              {restoreError}
            </p>
          )}
        </AdminDialog>
      )}
      {blocker.state === 'blocked' && (
        <AdminDialog
          title={busy ? '처리 결과를 확인해 주세요' : '미저장 변경을 버리고 이동할까요?'}
          onClose={() => blocker.reset()}
          footer={
            <>
              <button className={button} onClick={() => blocker.reset()}>
                계속 작성
              </button>
              <button className={button} disabled={busy} onClick={() => blocker.proceed()}>
                변경 버리고 이동
              </button>
            </>
          }
        >
          <p className="text-sm">
            {busy ? '저장·조회가 끝난 뒤 이동할 수 있어요.' : '저장하지 않은 입력이 사라져요.'}
          </p>
        </AdminDialog>
      )}
      {(nextTab !== null || reloadConfirm) && (
        <AdminDialog
          title="미저장 변경을 버릴까요?"
          description="현재 입력을 서버 값으로 교체해요. 보관이 필요하면 먼저 내용을 기록해 주세요."
          onClose={() => {
            setNextTab(null)
            setReloadConfirm(false)
          }}
          footer={
            <AdminDialogActions
              confirmLabel="변경 버리기"
              onCancel={() => {
                setNextTab(null)
                setReloadConfirm(false)
              }}
              onConfirm={() => {
                setDraft(toDraft(baseline.settings))
                setShowErrors(false)
                if (nextTab) {
                  setTab(nextTab)
                  setNextTab(null)
                } else {
                  setReloadConfirm(false)
                  void reload()
                }
              }}
            />
          }
        >
          <p className="text-sm">{changes.length}개 항목을 아직 저장하지 않았어요.</p>
        </AdminDialog>
      )}
    </>
  )
}

function SettingsDiff({
  before,
  after,
  historical = false,
}: {
  before: OperationSettings['settings']
  after: OperationSettings['settings']
  historical?: boolean
}) {
  const a = toDraft(before)
  const b = toDraft(after)
  const changed = fields.filter((f) => a[f.path] !== b[f.path])
  const display = (
    f: (typeof fields)[number],
    values: OperationSettings['settings'],
    draft: Record<string, string>,
  ) =>
    historical &&
    ((f.path.startsWith('quest.') && values.quest == null) ||
      (f.path.startsWith('institutionSubscription.') && values.institutionSubscription == null))
      ? missingPolicyMessage
      : settingDisplay(f, draft[f.path])
  return (
    <div className="space-y-2">
      {historical &&
        (['before', 'after'] as const).map((side) => {
          const missing = missingHistoryPolicies(side === 'before' ? before : after)
          return missing.length ? (
            <p key={side} className="text-sm text-admin-muted">
              변경 {side === 'before' ? '전' : '후'} · {missing.join(', ')}: {missingPolicyMessage}
            </p>
          ) : null
        })}
      {changed.length === 0 && (
        <p className="text-sm text-admin-muted">편집 가능한 값의 차이가 없어요.</p>
      )}
      {changed.map((f) => (
        <div key={f.path} className="rounded-lg bg-admin-bg p-3 text-sm">
          <p className="font-semibold">{f.label}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">
            {display(f, before, a)} → {display(f, after, b)}
          </p>
        </div>
      ))}
    </div>
  )
}
function AttendanceStats() {
  const navigate = useNavigate()
  const [date, setDate] = useState(() =>
    new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
  )
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const stats = useApi(valid ? `admin-attendance-statistics:${date}` : null, (signal) =>
    getAttendanceStatistics(date, signal),
  )
  useEffect(() => {
    if (stats.error) redirectIfUnauthorized(stats.error, navigate, { to: adminPath() })
  }, [stats.error, navigate])
  return (
    <FormSection
      title="날짜별 발송 통계"
      description="KST 날짜 기준. FCM 수락은 기기 수신·알림 탭 전환을 뜻하지 않아요. 발송 시도 이후 활동은 인과관계가 아닌 집계예요."
    >
      <label className="text-sm" htmlFor="statistics-date">
        조회 날짜 (KST)
      </label>
      <input
        id="statistics-date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={inputClassName()}
      />
      {!valid ? (
        <p role="alert">날짜를 선택하세요.</p>
      ) : stats.error ? (
        <AdminErrorMessage error={stats.error} onRetry={stats.refetch} />
      ) : stats.loading || !stats.data ? (
        <AdminMessage text="통계를 조회하고 있어요…" />
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-4">
            {[
              ['선정 사용자', stats.data.selectedUsers],
              ['FCM 수락 사용자', stats.data.acceptedUsers],
              ['발송 시도 후 출석', stats.data.attendanceAfterAttemptUsers],
              ['발송 시도 후 업로드', stats.data.uploadAfterAttemptUsers],
            ].map(([label, count]) => (
              <div key={label}>
                <dt className="text-xs text-admin-muted">{label}</dt>
                <dd className="mt-1 text-lg font-semibold">{count}명</dd>
              </div>
            ))}
          </dl>
          <div className="text-xs text-admin-muted">
            {stats.data.deliveries.map((d) => (
              <p key={d.status}>
                {d.status}: {d.count}건
              </p>
            ))}
            {stats.data.recentFailures.map((f) => (
              <p key={f.deliveryId}>
                실패 #{f.deliveryId} · {f.status} · {f.failureCode}
              </p>
            ))}
          </div>
        </>
      )}
    </FormSection>
  )
}
