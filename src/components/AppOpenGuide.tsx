import { useEffect, useRef, useState } from 'react'
import { Cheddar } from './ui'
import { IconCopy } from './ui/icons'
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  androidIntentUrl,
  appSchemeUrl,
  kakaoOpenExternalUrl,
} from '../lib/appLink'
import { createAppOpenAttempt } from '../lib/appOpenAttempt'
import type { AppOpenState } from '../lib/appOpenAttempt'
import { copyToClipboard } from '../lib/clipboard'
import { detectDevicePlatform, detectInAppBrowser } from '../lib/inAppBrowser'
import { JOIN_KEY_RE } from '../lib/joinSecret'
import type { GroupRole } from '../types/api'
import { usePublicLocale } from '../i18n/usePublicLocale'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { PublicMetadata } from '../i18n/PublicMetadata'

interface AppOpenGuideProps {
  /** 공유 당시의 모임명. 초대 유효성이나 현재 멤버십을 나타내지는 않는다. */
  groupName?: string
  joinKey?: string
  role?: GroupRole
}

/**
 * 웹 초대 착지 전용(CHMO-820·953). 웹에서 합류하거나 설치 후 자동 참여를 약속하지 않는다.
 * 앱 열기·스토어 이동은 사용자 조작으로만 시작하며, 모임 안내와 수동 복귀 수단을 유지한다.
 * 플랫폼·인앱 판정은 기존 단일 원천, 링크 생성은 appLink 계약을 그대로 사용한다.
 */
export function AppOpenGuide({ groupName, joinKey, role }: AppOpenGuideProps) {
  const { locale, t } = usePublicLocale()
  const platform = detectDevicePlatform()
  const inAppBrowser = detectInAppBrowser()
  const mobile = platform !== 'other'
  const [openState, setOpenState] = useState<AppOpenState>('idle')
  const attempt = useRef<ReturnType<typeof createAppOpenAttempt> | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const [copying, setCopying] = useState(false)
  const [manualCopy, setManualCopy] = useState<{ label: string; value: string } | null>(null)

  useEffect(() => {
    const controller = createAppOpenAttempt(setOpenState)
    attempt.current = controller
    return () => {
      controller.dispose()
      attempt.current = null
    }
  }, [])

  // 앱의 코드 입력은 대문자만 받는다. 혼합 대소문자 viewer 토큰·구형 키는 링크로 복구한다.
  const copyableCode = role !== 'viewer' && joinKey && JOIN_KEY_RE.test(joinKey) ? joinKey : null
  const browserName = t(inAppBrowser === 'kakaotalk' ? 'kakaotalk' : 'instagram')

  const handleOpen = () => {
    const { pathname, search, href } = window.location
    const pathWithQuery = `${pathname}${search}`
    const launchUrl =
      platform === 'android' && inAppBrowser === 'kakaotalk'
        ? kakaoOpenExternalUrl(href)
        : platform === 'android'
          ? androidIntentUrl(pathWithQuery)
          : appSchemeUrl(pathWithQuery)
    attempt.current?.open(launchUrl)
  }

  const handleCopy = async (label: string, value: string) => {
    setCopying(true)
    try {
      if (await copyToClipboard(value)) {
        setManualCopy(null)
        setCopyMessage(t('copied', { label }))
      } else {
        setManualCopy({ label, value })
        setCopyMessage(t('copyFailed'))
      }
    } catch {
      setManualCopy({ label, value })
      setCopyMessage(t('copyFailed'))
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="min-h-dvh bg-app-bg text-app-ink sm:bg-app-chip sm:px-6 sm:py-8">
      <PublicMetadata title={t('invite')} description={t('mobileIntro')} />
      <div className="mx-auto max-w-[440px] bg-app-bg sm:rounded-[32px]">
        <header className="flex items-center justify-between gap-3 px-6 py-4">
          <span className="font-logo text-[21px]">
            {locale === 'ko' ? '치즈모아' : 'CheeseMoa'}
          </span>
          <LanguagePicker compact />
        </header>
        <main className="px-6 pb-safe-6 sm:px-8">
          <section className="pb-7 pt-5 text-center" aria-labelledby="invite-title">
            <div
              aria-hidden="true"
              className="relative mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-[36px] bg-app-yellowTint"
            >
              <Cheddar size={100} className="-rotate-6" />
              <span className="absolute -right-2 bottom-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-app-bg bg-primary">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              </span>
            </div>
            <p className="mb-2 text-sm font-medium text-app-inkSub">{t('inviteEyebrow')}</p>
            <h1
              id="invite-title"
              className="text-[28px] font-bold leading-[1.3] tracking-[-0.035em] [overflow-wrap:anywhere] [text-wrap:balance]"
            >
              {groupName || t('brand')}
            </h1>
            <p className="mx-auto mt-3 max-w-sm break-keep text-[15px] leading-relaxed text-app-inkSub [text-wrap:balance]">
              {t(mobile ? 'mobileIntro' : 'desktopIntro')}
            </p>
          </section>

          {mobile && (
            <div className="pb-6">
              <button
                type="button"
                onClick={handleOpen}
                disabled={openState === 'opening'}
                className="press flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-primary px-5 py-3 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-app-ink disabled:opacity-60"
              >
                {openState === 'opening'
                  ? t('openingButton')
                  : openState === 'idle'
                    ? t('openButton')
                    : t('retryButton')}
                <span aria-hidden="true">→</span>
              </button>
              <p
                role="status"
                className={
                  openState === 'idle'
                    ? 'sr-only'
                    : 'mt-3 text-center text-sm leading-relaxed text-app-inkSub'
                }
              >
                {t(openState)}
              </p>
            </div>
          )}

          <section
            aria-labelledby="invite-install-title"
            className="border-t border-app-border py-5 text-center"
          >
            <h2 id="invite-install-title" className="text-sm font-semibold">
              {t('installTitle')}
            </h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3">
              {(!mobile || platform === 'ios') && (
                <StoreLink
                  locale={locale}
                  store="appstore"
                  href={APP_STORE_URL}
                  onClick={() => attempt.current?.prepareStore()}
                >
                  {t('download', { store: 'App Store' })}
                </StoreLink>
              )}
              {(!mobile || platform === 'android') && (
                <StoreLink
                  locale={locale}
                  store="play"
                  href={PLAY_STORE_URL}
                  onClick={() => attempt.current?.prepareStore()}
                >
                  {t('download', { store: 'Google Play' })}
                </StoreLink>
              )}
            </div>
            <p className="mx-auto mt-2 max-w-sm break-keep text-[13px] leading-relaxed text-app-inkSub [text-wrap:balance]">
              {t('installSteps')}
            </p>
          </section>

          <section aria-label={t('inviteLink')} className="border-t border-app-border py-3">
            {copyableCode && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 py-1">
                <span className="text-sm text-app-inkSub">{t('joinCode')}</span>
                <button
                  type="button"
                  disabled={copying}
                  aria-label={t('copyCodeLabel', { code: copyableCode })}
                  onClick={() => void handleCopy(t('joinCode'), copyableCode)}
                  className="press flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-sm disabled:opacity-50"
                >
                  <span className="break-all font-semibold tracking-wider">{copyableCode}</span>
                  <span aria-hidden="true" className="shrink-0 text-app-inkSub">
                    <IconCopy size={16} />
                  </span>
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={copying}
              onClick={() => void handleCopy(t('inviteLink'), window.location.href)}
              className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-app-chip px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <span aria-hidden="true">
                <IconCopy size={16} />
              </span>
              {t('copyLink')}
            </button>
            <p
              role="status"
              className={copyMessage ? 'mt-3 text-sm leading-relaxed text-app-inkSub' : 'sr-only'}
            >
              {copyMessage}
            </p>
            {manualCopy && (
              <input
                aria-label={t('manualCopy', { label: manualCopy.label })}
                readOnly
                value={manualCopy.value}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-app-border bg-app-bg px-3 text-sm"
              />
            )}
          </section>

          {mobile && inAppBrowser && (
            <details className="group border-t border-app-border text-sm leading-relaxed">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
                {t('browserHelp', { browser: browserName })}
                <span aria-hidden="true" className="shrink-0 group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <p className="pb-4 text-app-inkSub">
                {t('browserSteps', { browser: platform === 'ios' ? 'Safari' : 'Chrome' })}
              </p>
            </details>
          )}
          <details className="group border-t border-app-border text-sm leading-relaxed">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
              {t('troubleTitle')}
              <span aria-hidden="true" className="shrink-0 group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <div className="space-y-3 pb-4 text-app-inkSub">
              <p>{t('returnBody')}</p>
              {copyableCode && <p>{t('codeHelp')}</p>}
              <ul className="list-disc space-y-3 pl-4">
                {['helpLogin', 'helpMember', 'helpExpired', 'helpStore'].map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </div>
          </details>
        </main>
      </div>
    </div>
  )
}

/** 같은 탭의 일반 링크: 뒤로가기로 초대에 복귀할 수 있도록 방문 기록을 유지한다. */
function StoreLink({
  href,
  locale,
  store,
  children,
  onClick,
}: {
  href: string
  locale: 'ko' | 'en' | 'ja'
  store: 'appstore' | 'play'
  children: string
  onClick?: () => void
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="press inline-flex min-h-14 max-w-full shrink-0 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-ink"
    >
      <img
        src={`/store-badges/${store}-${locale}.${store === 'appstore' ? 'svg' : 'png'}`}
        alt={children}
        className={store === 'appstore' ? 'h-10 w-auto max-w-full' : 'h-[52px] w-auto max-w-full'}
      />
    </a>
  )
}
