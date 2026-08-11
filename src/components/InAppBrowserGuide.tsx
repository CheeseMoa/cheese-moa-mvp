import { useCallback, useEffect, useRef, useState } from 'react'
import { PhoneShell } from './PhoneShell'
import { Button, Cheddar } from './ui'
import { APP_STORE_URL, appSchemeUrl, kakaoOpenExternalUrl } from '../lib/appLink'
import { detectDevicePlatform } from '../lib/inAppBrowser'

/**
 * 카카오톡 인앱 브라우저로 초대 링크가 열렸을 때 먼저 서는 안내 (CHMO-661).
 *
 * 인앱 브라우저는 딥링크를 가로채지 않고 구글 로그인도 거부하므로, 여기서 앱(iOS)이나 기기
 * 기본 브라우저(Android)로 건너가게 한다. **자동 전환은 하지 않는다**(2026-08-11 확정) —
 * 카톡이 외부 열기를 막는 기기에서는 아무 일도 일어나지 않고, 사용자는 왜 멈췄는지 모른 채
 * 빈 화면을 본다. 대신 탭 한 번을 받고, 웹으로 계속 쓸 길([이대로 계속 보기])도 남긴다.
 *
 * 갈래가 플랫폼별로 다른 이유는 스토어 상태다: iOS 앱은 출시됐고(CHMO-657) Android는 Play
 * 미출시(CHMO-321)라 안드로이드는 보낼 스토어가 없다 — 카톡 밖 브라우저에서 웹으로 이어간다.
 */
interface InAppBrowserGuideProps {
  /** 링크 마커로 아는 모임명(lib/joinLink) — 어느 초대인지 알려 안내가 뜬금없지 않게 한다 */
  groupName?: string
  /** [이대로 계속 보기] — 호출부가 종전 합류 흐름을 그대로 그린다 */
  onContinue: () => void
}

/**
 * 스킴 시도 후 App Store로 넘어가기까지의 대기. 앱이 열리면 이 페이지가 백그라운드로 내려가
 * 타이머가 취소되고, 안 열리면(미설치) 그대로 스토어로 간다. 너무 짧으면 앱이 뜨는 중에
 * 스토어가 겹쳐 열리고, 너무 길면 미설치 사용자가 멈춘 화면을 오래 본다.
 */
const STORE_FALLBACK_DELAY_MS = 1500

export function InAppBrowserGuide({ groupName, onContinue }: InAppBrowserGuideProps) {
  const isIOS = detectDevicePlatform() === 'ios'
  const [opening, setOpening] = useState(false)
  const fallbackTimer = useRef<number | null>(null)

  const clearFallback = useCallback(() => {
    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current)
      fallbackTimer.current = null
    }
  }, [])

  // 앱이 열리면 이 페이지는 숨겨진다 — 그 신호로 스토어 폴백을 취소한다(안 그러면 앱에서
  // 돌아왔을 때 App Store가 떠 있다). pagehide는 웹뷰가 화면을 통째로 넘길 때의 보루.
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

  const handleOpen = () => {
    const { pathname, search, href } = window.location
    if (!isIOS) {
      // Android·기타: 카톡 밖 기본 브라우저로 같은 주소를 연다. 앱 링크는 Play 출시 후에
      // 이 자리에서 intent:// 로 바뀐다(그전엔 설치할 앱이 없어 보낼 곳이 없다).
      window.location.href = kakaoOpenExternalUrl(href)
      return
    }
    const scheme = appSchemeUrl(`${pathname}${search}`)
    if (!scheme) {
      window.location.href = APP_STORE_URL
      return
    }
    setOpening(true)
    clearFallback()
    fallbackTimer.current = window.setTimeout(() => {
      fallbackTimer.current = null
      setOpening(false)
      // 여기까지 왔다 = 앱이 안 열렸다(미설치). replace라 스토어에서 뒤로 오면 이 안내로 돌아온다
      window.location.replace(APP_STORE_URL)
    }, STORE_FALLBACK_DELAY_MS)
    window.location.href = scheme
  }

  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="my-auto flex flex-col items-center px-6 text-center">
          <Cheddar size={72} />
          {groupName ? (
            <p className="mt-5 text-[13px] text-muted">‘{groupName}’ 초대</p>
          ) : null}
          <h1 className="mt-2 text-[22px] leading-snug text-heading">
            {isIOS ? '치즈모아 앱에서 열어보세요' : '브라우저에서 열어보세요'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            카카오톡 안에서는 일부 로그인이 제한돼요.
            <br />
            {isIOS
              ? '앱에서 열면 초대받은 모임으로 바로 이어져요.'
              : '브라우저에서 열면 이어서 참여할 수 있어요.'}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 px-5 pb-safe-9">
          <Button fullWidth onClick={handleOpen} disabled={opening}>
            {opening ? '앱을 여는 중…' : isIOS ? '앱에서 열기' : '브라우저에서 열기'}
          </Button>
          {/* 웹으로도 쓸 수 있다 — 앱 설치를 강요하지 않는다 */}
          <button
            type="button"
            onClick={onContinue}
            className="text-[13px] text-muted underline underline-offset-2"
          >
            이대로 계속 보기
          </button>
        </div>
      </div>
    </PhoneShell>
  )
}
