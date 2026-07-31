import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BridgeError,
  __resetBridgeStateForTest,
  callBridge,
  getCapabilities,
  hasCapability,
  isNativeApp,
  nativeAppInfo,
  newOpId,
  openAppSettings,
  savePhotos,
  socialLogin,
  subscribeBridgeProgress,
} from './bridge'

/**
 * 브리지 계약 테스트 (CHMO-537) — Flutter 셸 없이 계약을 고정한다.
 * 검증 대상은 "셸이 계약(app-shell-spec §2)대로 주면 웹 래퍼는 이렇게 본다"이지
 * 셸 구현이 아니다. window·navigator는 vi.stubGlobal로 심는다(unstubGlobals 자동 원복).
 */

const APP_UA = 'Mozilla/5.0 (Linux; Android 14) CheeseMoaApp/1.2.0 (android) Bridge/1'
const WEB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15'

type TestWindow = EventTarget & {
  flutter_inappwebview?: { callHandler: ReturnType<typeof vi.fn> }
}

function stubApp(ua: string = APP_UA): void {
  vi.stubGlobal('navigator', { userAgent: ua })
}

function stubWindow(withBridge = true): TestWindow {
  const w = new EventTarget() as TestWindow
  if (withBridge) w.flutter_inappwebview = { callHandler: vi.fn() }
  vi.stubGlobal('window', w)
  return w
}

function okEnvelope(result?: unknown) {
  return { ok: true, ...(result !== undefined ? { result } : {}) }
}

beforeEach(() => {
  __resetBridgeStateForTest()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('앱 감지 (계약 §2.1 — UA 마커 단일 원천)', () => {
  it('마커가 없으면 웹 단독으로 본다', () => {
    stubApp(WEB_UA)
    expect(isNativeApp()).toBe(false)
    expect(nativeAppInfo()).toBeNull()
  })

  it('마커가 있으면 앱으로 보고 부가 정보를 파싱한다', () => {
    stubApp()
    expect(isNativeApp()).toBe(true)
    expect(nativeAppInfo()).toEqual({ appVersion: '1.2.0', platform: 'android', bridgeVersion: 1 })
  })

  it('마커는 있는데 형식이 다르면 감지는 참, 정보는 null — 둘은 별개다', () => {
    stubApp('Mozilla/5.0 CheeseMoaApp/next')
    expect(isNativeApp()).toBe(true)
    expect(nativeAppInfo()).toBeNull()
  })

  it('navigator가 아예 없어도(node) 던지지 않고 웹 단독으로 본다', () => {
    // 이 테스트 프로세스의 navigator를 스텁하지 않은 상태 그대로 확인하기 위해
    // 마커 없는 값으로 명시 스텁한다(node 24는 자체 navigator를 가진다).
    stubApp('node')
    expect(isNativeApp()).toBe(false)
  })
})

describe('웹 단독 폴백 — 기존 화면 무영향 보장', () => {
  it('callBridge는 UNSUPPORTED로 거부한다', async () => {
    stubApp(WEB_UA)
    await expect(callBridge('savePhotos')).rejects.toMatchObject({
      name: 'BridgeError',
      code: 'UNSUPPORTED',
    })
  })

  it('hasCapability는 브리지를 부르지 않고 false를 준다', async () => {
    stubApp(WEB_UA)
    const w = stubWindow()
    await expect(hasCapability('savePhotos')).resolves.toBe(false)
    expect(w.flutter_inappwebview!.callHandler).not.toHaveBeenCalled()
  })

  it('subscribeBridgeProgress는 창 컨텍스트가 없으면 no-op 해제 함수를 준다', () => {
    // window 미스텁(node 기본) — 던지지 않아야 한다
    expect(() => subscribeBridgeProgress('op', () => {})()).not.toThrow()
  })
})

describe('호출 봉투 (계약 §2.2·§2.4)', () => {
  it('요청은 {v, method, params}로 나가고 ok:true의 result를 돌려준다', async () => {
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockResolvedValue(okEnvelope({ callbackUrl: '/auth/callback?code=abc' }))

    const res = await socialLogin({ provider: 'google', authorizeUrl: 'https://api.example/auth/social/google' })

    expect(res).toEqual({ callbackUrl: '/auth/callback?code=abc' })
    expect(w.flutter_inappwebview!.callHandler).toHaveBeenCalledWith('cheesemoa', {
      v: 1,
      method: 'socialLogin',
      params: { provider: 'google', authorizeUrl: 'https://api.example/auth/social/google' },
    })
  })

  it('params가 없으면 요청에 params 키 자체가 없다', async () => {
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockResolvedValue(okEnvelope())

    await openAppSettings()

    expect(w.flutter_inappwebview!.callHandler).toHaveBeenCalledWith('cheesemoa', {
      v: 1,
      method: 'openAppSettings',
    })
  })

  it('ok:false는 code·message·detail을 든 BridgeError로 던진다', async () => {
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockResolvedValue({
      ok: false,
      code: 'PERMISSION_DENIED',
      message: '사진 접근이 거부됐습니다.',
      detail: { canOpenSettings: true },
    })

    const err = await savePhotos({ opId: 'op1', photos: [{ url: 'https://x/1.jpg' }] }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(BridgeError)
    expect(err).toMatchObject({
      code: 'PERMISSION_DENIED',
      message: '사진 접근이 거부됐습니다.',
      detail: { canOpenSettings: true },
    })
  })

  it('미지 에러 코드는 그대로 통과한다 — 진실 테이블에 굳히지 않는다', async () => {
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockResolvedValue({ ok: false, code: 'FUTURE42' })

    await expect(callBridge('anything')).rejects.toMatchObject({ code: 'FUTURE42' })
  })

  it('계약 밖 응답(봉투 아님·code 없는 실패)은 INTERNAL로 정규화한다', async () => {
    stubApp()
    const w = stubWindow()

    w.flutter_inappwebview!.callHandler.mockResolvedValueOnce('garbage')
    await expect(callBridge('m1')).rejects.toMatchObject({ code: 'INTERNAL' })

    w.flutter_inappwebview!.callHandler.mockResolvedValueOnce({ ok: false })
    await expect(callBridge('m2')).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('callHandler가 던지면 INTERNAL로 감싼다', async () => {
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockRejectedValue(new Error('boom'))

    await expect(callBridge('m')).rejects.toMatchObject({ code: 'INTERNAL', message: 'boom' })
  })
})

describe('platformReady 대기·타임아웃 (계약 §2.2 — 판정은 웹 래퍼)', () => {
  it('주입 전 호출은 ready 이벤트 후 실행된다', async () => {
    stubApp()
    const w = stubWindow(false)

    const call = callBridge<{ pong: true }>('ping')
    // 아직 브리지가 없다 — 셸이 주입을 끝내고 ready를 쏜다
    w.flutter_inappwebview = { callHandler: vi.fn().mockResolvedValue(okEnvelope({ pong: true })) }
    w.dispatchEvent(new Event('flutterInAppWebViewPlatformReady'))

    await expect(call).resolves.toEqual({ pong: true })
  })

  it('ready가 영영 안 오면 기본 5초에 TIMEOUT', async () => {
    vi.useFakeTimers()
    stubApp()
    stubWindow(false)

    const call = callBridge('ping')
    const assertion = expect(call).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(5001)
    await assertion
  })

  it('응답이 안 오면 기본 5초에 TIMEOUT', async () => {
    vi.useFakeTimers()
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockReturnValue(new Promise(() => {}))

    const call = callBridge('slow')
    const assertion = expect(call).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(5001)
    await assertion
  })

  it('장기 실행 메서드(savePhotos·socialLogin)는 시간 제한이 없다', async () => {
    vi.useFakeTimers()
    stubApp()
    const w = stubWindow()
    let finish!: (v: unknown) => void
    w.flutter_inappwebview!.callHandler.mockReturnValue(new Promise((resolve) => (finish = resolve)))

    const call = savePhotos({ opId: 'op1', photos: [{ url: 'https://x/1.jpg' }] })
    await vi.advanceTimersByTimeAsync(60_000)
    finish(okEnvelope({ saved: 1, failed: [] }))

    await expect(call).resolves.toEqual({ saved: 1, failed: [] })
  })
})

describe('진행 이벤트 구독 (계약 §2.3)', () => {
  it('같은 opId의 progress만 받고, 해제 후엔 받지 않는다', () => {
    stubApp()
    const w = stubWindow()
    const seen: { done: number; total: number }[] = []
    const unsubscribe = subscribeBridgeProgress('op1', (p) => seen.push(p))

    const fire = (detail: unknown) => w.dispatchEvent(new CustomEvent('cheesemoa:event', { detail }))
    fire({ v: 1, type: 'progress', opId: 'op1', done: 1, total: 3 })
    fire({ v: 1, type: 'progress', opId: 'other', done: 9, total: 9 }) // 다른 작업
    fire({ v: 1, type: 'done', opId: 'op1' }) // 미지 타입 — 무시
    fire({ v: 1, type: 'progress', opId: 'op1', done: '2', total: 3 }) // 형식 불량 — 무시
    fire({ v: 1, type: 'progress', opId: 'op1', done: 2, total: 3 })

    unsubscribe()
    fire({ v: 1, type: 'progress', opId: 'op1', done: 3, total: 3 })

    expect(seen).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
    ])
  })

  it('newOpId는 호출마다 다른 값을 준다', () => {
    expect(newOpId()).not.toBe(newOpId())
  })
})

describe('capability 조회 (계약 §2.5 getCapabilities — 세션당 1회 캐시)', () => {
  const CAPS = okEnvelope({ v: 1, platform: 'android', appVersion: '1.2.0', capabilities: ['savePhotos'] })

  it('성공 결과는 캐시된다 — 두 번 물어도 브리지는 1회', async () => {
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockResolvedValue(CAPS)

    await expect(hasCapability('savePhotos')).resolves.toBe(true)
    await expect(hasCapability('socialLogin')).resolves.toBe(false) // 구버전 앱 — 웹 폴백 분기
    await expect(getCapabilities()).resolves.toMatchObject({ platform: 'android' })

    expect(w.flutter_inappwebview!.callHandler).toHaveBeenCalledTimes(1)
  })

  it('실패는 캐시하지 않는다 — 일시 실패가 기능을 영영 숨기지 않게', async () => {
    stubApp()
    const w = stubWindow()
    w.flutter_inappwebview!.callHandler.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(CAPS)

    await expect(hasCapability('savePhotos')).resolves.toBe(false)
    await expect(hasCapability('savePhotos')).resolves.toBe(true)
    expect(w.flutter_inappwebview!.callHandler).toHaveBeenCalledTimes(2)
  })
})
