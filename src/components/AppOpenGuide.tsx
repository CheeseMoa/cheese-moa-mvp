import { useCallback, useEffect, useRef, useState } from 'react'
import { PhoneShell } from './PhoneShell'
import { Button, Cheddar } from './ui'
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  androidIntentUrl,
  appSchemeUrl,
  kakaoOpenExternalUrl,
} from '../lib/appLink'
import { detectDevicePlatform, detectInAppBrowser } from '../lib/inAppBrowser'

/**
 * 초대 링크 착지 = 앱 유도 (CHMO-820 — CHMO-661의 카카오톡 전용 안내를 전 환경으로 승격).
 *
 * `/join/:joinKey`가 웹에서 열렸다는 것은 OS가 앱으로 넘기지 않았다는 뜻이다 — 앱이 없거나,
 * 유니버설 링크/App Links가 발동하지 않는 자리(카카오톡 인앱 브라우저·주소창 직접 입력)다.
 * 어느 쪽이든 웹은 합류를 그리지 않고 **앱을 열거나 스토어로 보내는 일만 한다**(2026-09-16
 * "무조건 앱으로" — 웹으로 계속 쓰는 길([이대로 계속 보기])은 없앴다).
 *
 * **자동 전환은 하지 않는다**(2026-08-11 확정 유지) — 탭 없는 스킴·intent 시도는 브라우저마다
 * 막히거나(카톡의 외부 열기 차단·크롬의 무제스처 intent 차단) 확인창을 띄우고, 그 사이 시간
 * 폴백이 먼저 달려 **앱이 있는 사람을 스토어로 보내는** 오판이 난다. 탭 한 번을 받는다.
 *
 * 수단은 플랫폼 × 인앱 여부로 가른다:
 * - iOS(카톡 안·밖 공통): 커스텀 스킴 → 1.5초 안에 화면이 살아 있으면 미설치로 보고 App Store.
 * - Android · 카카오톡: `kakaotalk://web/openExternal`로 기본 브라우저 이탈 — 크롬이 같은 주소를
 *   받으면 App Links(assetlinks.json)로 앱이 바로 열리고, 미설치면 크롬에서 이 화면이 다시 서서
 *   아래 intent 규칙을 탄다. 카톡 웹뷰가 intent://를 해석하는지는 미검증이라 검증된 이탈을 쓴다.
 * - Android · 일반 브라우저: `intent://…;package=…;S.browser_fallback_url=Play` — 패키지 직지정이라
 *   App Links 검증과 무관하게 설치본이 열리고, 미설치면 브라우저가 스스로 Play로 간다. intent를
 *   모르는 브라우저를 위해 같은 1.5초 시간 폴백을 겹친다.
 * - 그 외(PC 등): 앱을 열 수 없는 기기 — "휴대폰에서 열어 주세요" + 스토어 링크 2개.
 *
 * 설치 뒤 자동 이어받기(deferred deep link)는 없다 — 스토어에서 설치한 사람은 받은 링크를 한 번
 * 더 눌러야 참여 시트가 뜬다(티켓 "한계" 절).
 */
interface AppOpenGuideProps {
  /** 링크 마커로 아는 모임명(lib/joinLink) — 어느 초대인지 알려 안내가 뜬금없지 않게 한다 */
  groupName?: string
}

/**
 * 앱 열기 시도 후 스토어로 넘어가기까지의 대기. 앱이 열리면 이 페이지가 백그라운드로 내려가
 * 타이머가 취소되고, 안 열리면(미설치) 그대로 스토어로 간다. 너무 짧으면 앱이 뜨는 중에
 * 스토어가 겹쳐 열리고, 너무 길면 미설치 사용자가 멈춘 화면을 오래 본다.
 */
const STORE_FALLBACK_DELAY_MS = 1500

export function AppOpenGuide({ groupName }: AppOpenGuideProps) {
  const platform = detectDevicePlatform()
  const inKakao = detectInAppBrowser() === 'kakaotalk'
  const [opening, setOpening] = useState(false)
  const fallbackTimer = useRef<number | null>(null)

  const clearFallback = useCallback(() => {
    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current)
      fallbackTimer.current = null
    }
  }, [])

  // 앱이 열리면 이 페이지는 숨겨진다 — 그 신호로 스토어 폴백을 취소한다(안 그러면 앱에서
  // 돌아왔을 때 스토어가 떠 있다). pagehide는 웹뷰가 화면을 통째로 넘길 때의 보루.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        clearFallback()
        setOpening(false)
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', clearFallback)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', clearFallback)
      clearFallback()
    }
  }, [clearFallback])

  const storeUrl = platform === 'android' ? PLAY_STORE_URL : APP_STORE_URL

  /** 앱 열기 시도 + 시간 폴백. 시도할 링크가 없으면(경로 공백) 바로 스토어. */
  const openWithFallback = (launchUrl: string | null) => {
    if (!launchUrl) {
      window.location.href = storeUrl
      return
    }
    setOpening(true)
    clearFallback()
    fallbackTimer.current = window.setTimeout(() => {
      fallbackTimer.current = null
      setOpening(false)
      // 여기까지 왔다 = 앱이 안 열렸다(미설치). replace라 스토어에서 뒤로 오면 이 안내로 돌아온다
      window.location.replace(storeUrl)
    }, STORE_FALLBACK_DELAY_MS)
    window.location.href = launchUrl
  }

  const handleOpen = () => {
    const { pathname, search, href } = window.location
    if (platform === 'android' && inKakao) {
      // 카톡 밖 기본 브라우저로 같은 주소를 연다 — 크롬이 App Links로 앱을 열거나, 미설치면
      // 크롬에서 이 화면이 다시 서서 intent 규칙을 탄다
      window.location.href = kakaoOpenExternalUrl(href)
      return
    }
    const pathWithQuery = `${pathname}${search}`
    openWithFallback(
      platform === 'android' ? androidIntentUrl(pathWithQuery) : appSchemeUrl(pathWithQuery),
    )
  }

  if (platform === 'other') {
    return (
      <PhoneShell>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="my-auto flex flex-col items-center px-6 text-center">
            <Cheddar size={72} />
            {groupName ? <p className="mt-5 text-[13px] text-muted">‘{groupName}’ 초대</p> : null}
            <h1 className="mt-2 text-[22px] leading-snug text-heading">휴대폰에서 열어 주세요</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              치즈모아는 휴대폰 앱에서 쓸 수 있어요.
              <br />
              받은 초대 링크를 휴대폰에서 열면 앱으로 이어져요.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 px-5 pb-safe-9">
            <StoreLink href={APP_STORE_URL}>App Store에서 받기</StoreLink>
            <StoreLink href={PLAY_STORE_URL}>Google Play에서 받기</StoreLink>
          </div>
        </div>
      </PhoneShell>
    )
  }

  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="my-auto flex flex-col items-center px-6 text-center">
          <Cheddar size={72} />
          {groupName ? <p className="mt-5 text-[13px] text-muted">‘{groupName}’ 초대</p> : null}
          <h1 className="mt-2 text-[22px] leading-snug text-heading">치즈모아 앱에서 열어보세요</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {inKakao ? '카카오톡 안에서는 앱으로 바로 이어지지 않아요.' : '초대는 앱에서 받아요.'}
            <br />
            앱이 없으면 {platform === 'android' ? 'Google Play' : 'App Store'}로 이동해요.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 px-5 pb-safe-9">
          <Button variant="accent" fullWidth onClick={handleOpen} disabled={opening}>
            {opening ? '앱을 여는 중…' : '앱에서 열기'}
          </Button>
          {/* 앱이 없는 걸 스스로 아는 사람은 시도·대기 없이 바로 스토어로 */}
          <a
            href={storeUrl}
            className="text-[13px] text-muted underline underline-offset-2"
            onClick={clearFallback}
          >
            {platform === 'android' ? 'Google Play에서 받기' : 'App Store에서 받기'}
          </a>
        </div>
      </div>
    </PhoneShell>
  )
}

/** PC 안내의 스토어 링크 — 외부 URL이라 router `ButtonLink` 대신 앵커(secondary 버튼 꼴). */
function StoreLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="press inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-border bg-surface text-[15px] font-bold text-text"
    >
      {children}
    </a>
  )
}
