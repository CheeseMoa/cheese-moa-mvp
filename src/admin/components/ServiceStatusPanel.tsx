import type { ReactNode } from 'react'
import type {
  Locale,
  ServiceMode,
  ServiceSettings,
  SettingsHistory,
} from '../api/operationSettings'
import { formatDateTime } from '../lib/format'
import { inputClassName, textareaClassName } from '../lib/formStyles'
import {
  LOCALE_LABEL,
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  READ_ONLY_KEEPS,
  READ_ONLY_STOPS,
  SERVICE_PAUSE_COPY,
  isPausedMode,
  noticeLength,
  noticeOf,
  noticeSource,
  serviceModeLabel,
} from '../lib/serviceStatus'
import { AdminNotice, ChoiceGroup, Field, FormSection } from './AdminForm'
import { ServicePausePreview } from './ServicePausePreview'

const LOCALES: Locale[] = ['ko', 'en', 'ja']
const button =
  'min-h-10 rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] hover:bg-admin-bg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const primary = `${button} border-primary bg-primary font-semibold hover:bg-primary`

/** 마지막 전환 기록의 조회 상태 — 서버에 전용 필드가 없어 변경 이력 첫 페이지에서 찾는다 */
export type ModeChange =
  | { state: 'loading' }
  | { state: 'error'; retry: () => void }
  | { state: 'found'; item: SettingsHistory }
  | { state: 'notInPage' }
  | { state: 'none' }

/**
 * 「서비스 상태」 현재 상태 카드 (CHMO-994 AC-1). 전환은 확인창(사유·확인 문구)을 거친다.
 * service가 null이면 서버(BE CHMO-993 배포 전)가 값을 주지 않은 것이라 버튼을 그리지 않는다.
 */
export function ServiceStatusCard({
  service,
  change,
  lockReason,
  onRequestMode,
  onOpenHistory,
  onOpenAppTab,
}: {
  service: ServiceSettings | null
  change: ModeChange
  /** 전환 버튼을 잠근 이유(미저장 문구·충돌·처리 중). null이면 누를 수 있다 */
  lockReason: string | null
  onRequestMode: (mode: ServiceMode) => void
  onOpenHistory: () => void
  onOpenAppTab: () => void
}) {
  const paused = isPausedMode(service?.mode)
  return (
    <FormSection
      title="서비스 상태"
      description="읽기 전용으로 바꾸면 사용자는 올린 사진을 보고 저장·공유만 할 수 있어요. 관리자 화면은 그대로 쓸 수 있어요."
    >
      {!service ? (
        <AdminNotice
          title="서비스 상태를 확인할 수 없어요"
          lines={[
            '서버가 이 설정을 아직 제공하지 않아요(BE CHMO-993 배포 전). 기본값으로 채우지 않고 전환과 문구 편집을 잠갔어요. 서버 업데이트 뒤 최신 설정을 조회해 주세요.',
          ]}
        />
      ) : (
        <>
          <div
            className={`rounded-xl border px-5 py-4 ${paused ? 'border-primary bg-admin-nav' : 'border-admin-border bg-admin-bg'}`}
          >
            <p className="text-xs text-admin-muted">현재 상태</p>
            <p className="mt-1 text-xl font-bold">
              {service.mode === 'READ_ONLY'
                ? '읽기 전용 운영 중'
                : paused
                  ? `${serviceModeLabel(service.mode)} · 앱은 읽기 전용으로 처리해요`
                  : '평소 운영'}
            </p>
            <LastChange
              change={change}
              updatedAt={service.updatedAt ?? null}
              onOpenHistory={onOpenHistory}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {service.mode !== 'READ_ONLY' && (
              <button
                type="button"
                className={primary}
                disabled={Boolean(lockReason)}
                onClick={() => onRequestMode('READ_ONLY')}
              >
                읽기 전용으로 전환
              </button>
            )}
            {service.mode !== 'NORMAL' && (
              <button
                type="button"
                className={primary}
                disabled={Boolean(lockReason)}
                onClick={() => onRequestMode('NORMAL')}
              >
                평소 운영으로 복귀
              </button>
            )}
            {lockReason && <p className="text-xs text-admin-muted">{lockReason}</p>}
          </div>
        </>
      )}
      <AdminNotice
        title="앱 버전과 함께 확인해 주세요"
        lines={[
          '구버전 앱은 막힌 요청에 일반 오류만 보여요. 새 앱이 양 스토어에 나간 뒤 앱 최소 버전을 올려 주세요.',
          <button key="app" type="button" className="underline" onClick={onOpenAppTab}>
            앱 버전·스토어 설정으로 이동
          </button>,
        ]}
      />
    </FormSection>
  )
}

/**
 * 전환한 운영자·사유는 이력에만 있다. 이력 첫 페이지에 없으면 서버의 `service.updatedAt`
 * (상태·문구가 마지막으로 바뀐 시각)이라도 보여 준다.
 */
function LastChange({
  change,
  updatedAt,
  onOpenHistory,
}: {
  change: ModeChange
  updatedAt: string | null
  onOpenHistory: () => void
}) {
  const historyLink = (
    <button type="button" className="underline" onClick={onOpenHistory}>
      변경 이력 보기
    </button>
  )
  let content: ReactNode
  switch (change.state) {
    case 'loading':
      content = '마지막 전환 기록을 불러오고 있어요…'
      break
    case 'error':
      content = (
        <>
          마지막 전환 기록을 불러오지 못했어요.{' '}
          <button type="button" className="underline" onClick={change.retry}>
            다시 시도
          </button>
        </>
      )
      break
    case 'notInPage':
      content = (
        <>
          최근 변경 이력 20건에는 상태 전환 기록이 없어요.
          {updatedAt ? ` 상태·문구 마지막 변경 ${formatDateTime(updatedAt)}.` : ''} {historyLink}
        </>
      )
      break
    case 'none':
      content = updatedAt
        ? `상태를 전환한 기록이 없어요. 문구 마지막 변경 ${formatDateTime(updatedAt)}.`
        : '상태를 전환한 기록이 없어요.'
      break
    case 'found': {
      const { item } = change
      return (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
          <dt className="text-admin-muted">마지막 전환</dt>
          <dd>
            {formatDateTime(item.changedAt)} · 운영자 #{item.actorUserId} ·{' '}
            {serviceModeLabel(String(item.before.service?.mode))} →{' '}
            {serviceModeLabel(String(item.after.service?.mode))}
          </dd>
          <dt className="text-admin-muted">사유</dt>
          <dd className="whitespace-pre-wrap break-words">{item.reason}</dd>
        </dl>
      )
    }
  }
  return <p className="mt-3 text-[13px] text-admin-muted">{content}</p>
}

/**
 * 안내 문구 편집 (AC-2) — 언어를 골라 제목·본문을 고치고 같은 언어의 앱 화면을 옆에 그린다.
 * 값은 페이지의 운영 설정 draft(경로 키)를 그대로 쓴다. 저장은 다른 구분과 같은 확인창을 거친다.
 */
export function ServiceNoticeEditor({
  draft,
  onChange,
  locale,
  onLocale,
  errors,
  disabled,
}: {
  draft: Record<string, string>
  onChange: (path: string, value: string) => void
  locale: Locale
  onLocale: (locale: Locale) => void
  /** 화면에 보일 오류(경로 → 문구). 제출 전에는 비워 둔다 */
  errors: Record<string, string>
  disabled: boolean
}) {
  const titlePath = `service.notice.${locale}.title`
  const bodyPath = `service.notice.${locale}.body`
  const title = draft[titlePath] ?? ''
  const body = draft[bodyPath] ?? ''
  const fallback = SERVICE_PAUSE_COPY[locale]
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-4">
        <ChoiceGroup
          label="안내 문구 언어"
          value={locale}
          onChange={onLocale}
          choices={LOCALES.map((l) => {
            const t = draft[`service.notice.${l}.title`] ?? ''
            const b = draft[`service.notice.${l}.body`] ?? ''
            const invalid =
              errors[`service.notice.${l}.title`] || errors[`service.notice.${l}.body`]
            return {
              value: l,
              label: `${LOCALE_LABEL[l]} · ${invalid ? '확인 필요' : noticeSource(t, b)}`,
            }
          })}
        />
        <Field
          label={`${LOCALE_LABEL[locale]} 제목`}
          htmlFor={titlePath}
          optional
          count={{ value: noticeLength(title), max: NOTICE_TITLE_MAX }}
          error={errors[titlePath]}
          hint="비우면 칸에 흐리게 보이는 앱 기본 제목이 나가요. 앞뒤 공백은 저장할 때 빠져요."
        >
          <input
            id={titlePath}
            value={title}
            placeholder={fallback.title}
            disabled={disabled}
            aria-invalid={Boolean(errors[titlePath])}
            className={inputClassName(Boolean(errors[titlePath]))}
            onChange={(e) => onChange(titlePath, e.target.value)}
          />
        </Field>
        <Field
          label={`${LOCALE_LABEL[locale]} 본문`}
          htmlFor={bodyPath}
          optional
          count={{ value: noticeLength(body), max: NOTICE_BODY_MAX }}
          error={errors[bodyPath]}
          hint="줄바꿈은 앱에서도 그대로 보여요. 비우면 앱 기본 본문이 나가요."
        >
          <textarea
            id={bodyPath}
            rows={5}
            value={body}
            placeholder={fallback.body}
            disabled={disabled}
            aria-invalid={Boolean(errors[bodyPath])}
            className={textareaClassName(Boolean(errors[bodyPath]))}
            onChange={(e) => onChange(bodyPath, e.target.value)}
          />
        </Field>
      </div>
      <ServicePausePreview locale={locale} title={title} body={body} />
    </div>
  )
}

/** 전환 확인창 본문 — 무엇이 되고 무엇이 막히는지, 앱에 어떤 문구가 나가는지 (AC-1) */
export function ServiceModeSummary({ service, to }: { service: ServiceSettings; to: ServiceMode }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <strong>{serviceModeLabel(service.mode)}</strong> → <strong>{serviceModeLabel(to)}</strong>
      </p>
      {to === 'READ_ONLY' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <ImpactList title="계속 되는 것" items={READ_ONLY_KEEPS} />
            <ImpactList title="막히는 것" items={READ_ONLY_STOPS} />
          </div>
          <AdminNotice
            title="적용 시점과 안내 문구"
            lines={[
              '저장하면 다음 요청부터 사용자 쓰기 요청이 막혀요. 앱 화면은 다음 실행·복귀 때, 또는 막힌 요청을 받는 즉시 읽기 전용으로 바뀌어요.',
              `앱 안내 문구: ${LOCALES.map((l) => {
                const copy = noticeOf(service, l)
                return `${LOCALE_LABEL[l]} ${noticeSource(copy.title, copy.body)}`
              }).join(' · ')}`,
              '전송 중이던 업로드도 등록되지 않고 취소돼요. 다시 운영하면 새로 올려야 해요. 이미 등록된 사진의 AI 분석은 끝까지 처리돼요.',
            ]}
          />
        </>
      ) : (
        <AdminNotice
          title="적용 시점"
          lines={[
            '저장하면 다음 요청부터 모든 쓰기가 다시 열려요.',
            '앱은 다음 실행·복귀 때 평소 화면으로 돌아가요.',
            '읽기 전용 동안 발송 시점이 지난 리마인드·출석·혜택 알림은 취소돼, 돌아와도 몰아서 나가지 않아요.',
          ]}
        />
      )}
    </div>
  )
}

function ImpactList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-admin-border bg-admin-bg p-3">
      <p className="text-[13px] font-semibold">{title}</p>
      <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-admin-muted">
              ·
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
