import { useEffect, useRef, useState } from 'react'
import { PhoneShell } from './PhoneShell'
import { Button, Cheddar } from './ui'
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
  const storeUrl = platform === 'android' ? PLAY_STORE_URL : APP_STORE_URL
  const storeName = platform === 'android' ? 'Google Play' : 'App Store'
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
    <PhoneShell>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-safe-6 pt-8 text-text">
        <PublicMetadata title={t('invite')} description={t('mobileIntro')} />
        <LanguagePicker />
        <header className="flex flex-col items-center text-center">
          <Cheddar size={56} />
          <p className="mt-5 w-full break-words text-sm [overflow-wrap:anywhere]">
            {groupName ? t('groupInvite', { group: groupName }) : t('invite')}
          </p>
          <h1 className="mt-2 text-[24px] font-bold leading-snug text-heading">
            {t(mobile ? 'mobileTitle' : 'desktopTitle')}
          </h1>
          <p className="mt-3 text-sm leading-relaxed">
            {t(mobile ? 'mobileIntro' : 'desktopIntro')}
          </p>
        </header>

        {mobile && inAppBrowser && (
          <aside className="mt-5 rounded-[14px] bg-surface p-4 text-sm leading-relaxed">
            <p className="font-bold">{t('browserHelp', { browser: browserName })}</p>
            <p className="mt-1">
              {t('browserSteps', { browser: platform === 'ios' ? 'Safari' : 'Chrome' })}
            </p>
          </aside>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {mobile ? (
            <>
              <p role="status" className="text-sm leading-relaxed">
                {t(openState)}
              </p>
              <Button
                variant="accent"
                fullWidth
                className="shrink-0"
                onClick={handleOpen}
                disabled={openState === 'opening'}
              >
                {openState === 'opening'
                  ? t('openingButton')
                  : openState === 'idle'
                    ? t('openButton')
                    : t('retryButton')}
              </Button>
              <StoreLink
                locale={locale}
                store={platform === 'android' ? 'play' : 'appstore'}
                href={storeUrl}
                onClick={() => attempt.current?.prepareStore()}
              >
                {t('download', { store: storeName })}
              </StoreLink>
            </>
          ) : (
            <>
              <StoreLink locale={locale} store="appstore" href={APP_STORE_URL}>
                {t('download', { store: 'App Store' })}
              </StoreLink>
              <StoreLink locale={locale} store="play" href={PLAY_STORE_URL}>
                {t('download', { store: 'Google Play' })}
              </StoreLink>
            </>
          )}
        </div>

        <section
          aria-labelledby="invite-return-title"
          className="mt-6 rounded-[14px] border border-border p-4"
        >
          <h2 id="invite-return-title" className="text-[15px] font-bold text-heading">
            {t('returnTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{t('returnBody')}</p>
          <button
            type="button"
            disabled={copying}
            onClick={() => void handleCopy(t('inviteLink'), window.location.href)}
            className="mt-3 min-h-11 w-full rounded-[10px] bg-surface px-3 py-2 text-sm font-bold disabled:opacity-50"
          >
            {t('copyLink')}
          </button>
          {copyableCode && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-sm leading-relaxed">{t('codeHelp')}</p>
              <button
                type="button"
                disabled={copying}
                aria-label={t('copyCodeLabel', { code: copyableCode })}
                onClick={() => void handleCopy(t('joinCode'), copyableCode)}
                className="mt-2 flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-[10px] bg-surface px-3 py-2 text-sm disabled:opacity-50"
              >
                <span className="break-all font-bold">{copyableCode}</span>
                <span>{t('copyCode')}</span>
              </button>
            </div>
          )}
          <p role="status" className="mt-2 text-sm leading-relaxed">
            {copyMessage}
          </p>
          {manualCopy && (
            <input
              aria-label={t('manualCopy', { label: manualCopy.label })}
              readOnly
              value={manualCopy.value}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-2 min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-cream px-3 text-sm"
            />
          )}
        </section>

        <details className="mt-4 text-sm leading-relaxed">
          <summary className="min-h-11 cursor-pointer py-3 font-bold text-heading">
            {t('troubleTitle')}
          </summary>
          <ul className="list-disc space-y-3 pb-4 pl-5">
            {['helpLogin', 'helpMember', 'helpExpired', 'helpStore'].map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </details>
      </main>
    </PhoneShell>
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
      className="press inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface px-4 py-3 text-center text-[15px] font-bold text-text"
    >
      <img
        src={`/store-badges/${store}-${locale}.${store === 'appstore' ? 'svg' : 'png'}`}
        alt={children}
        className={store === 'appstore' ? 'h-10 w-auto max-w-full' : 'h-[52px] w-auto max-w-full'}
      />
    </a>
  )
}
