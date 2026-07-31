/**
 * 앱(Flutter 웹뷰) 브리지 — 화면·lib 코드는 이 모듈만 본다 (api/mappers와 같은 격리 규칙).
 * 계약 원천: 앱 리포 `CheeseMoa-App/docs/app-shell-spec.md` §2 (CHMO-535).
 *
 * 웹 단독(브라우저) 실행에서는 전부 무해하다 — isNativeApp() false ·
 * hasCapability() false · callBridge()는 UNSUPPORTED 거부. 화면은 이 셋으로 분기한다.
 */
import {
  BRIDGE_SCHEMA_VERSION,
  type BridgeProgressEvent,
  type BridgeRequest,
  type CapabilitiesResult,
  type NativeAppInfo,
  type SavePhotosParams,
  type SavePhotosResult,
  type SocialLoginParams,
  type SocialLoginResult,
} from './types'

const UA_MARKER = 'CheeseMoaApp/'
const UA_INFO_RE = /CheeseMoaApp\/(\S+) \((ios|android)\) Bridge\/(\d+)/
const HANDLER_NAME = 'cheesemoa'
const EVENT_NAME = 'cheesemoa:event'
/** flutter_inappwebview가 주입 완료를 알리는 window 이벤트 — 그 전엔 주입 객체가 없다 */
const PLATFORM_READY_EVENT = 'flutterInAppWebViewPlatformReady'
const DEFAULT_TIMEOUT_MS = 5000

export class BridgeError extends Error {
  readonly code: string
  readonly detail?: unknown

  constructor(code: string, message?: string, detail?: unknown) {
    super(message ?? code)
    this.name = 'BridgeError'
    this.code = code
    this.detail = detail
  }
}

interface FlutterBridge {
  callHandler: (name: string, arg: unknown) => Promise<unknown>
}

type BridgeHost = EventTarget & { flutter_inappwebview?: FlutterBridge }

// node(테스트)엔 window가 없고, 브라우저 전역을 직접 참조하면 ReferenceError라
// globalThis 프로퍼티로만 읽는다. 테스트는 vi.stubGlobal('window', …)로 심는다.
function bridgeHost(): BridgeHost | null {
  const w = (globalThis as { window?: unknown }).window
  return w instanceof EventTarget ? (w as BridgeHost) : null
}

function userAgent(): string {
  const nav = (globalThis as { navigator?: { userAgent?: unknown } }).navigator
  return typeof nav?.userAgent === 'string' ? nav.userAgent : ''
}

/**
 * 앱 감지 단일 원천 — UA 마커만 본다.
 * 주입 객체(window.flutter_inappwebview)는 platformReady 이벤트 후에야 생겨
 * 첫 렌더 타이밍에 없을 수 있다 — 감지 수단이 아니라 호출 통로다(계약 §2.1).
 */
export function isNativeApp(): boolean {
  return userAgent().includes(UA_MARKER)
}

/** UA 마커의 부가 정보. 마커가 있어도 형식이 다르면 null — 감지(isNativeApp)와 별개다. */
export function nativeAppInfo(): NativeAppInfo | null {
  const m = UA_INFO_RE.exec(userAgent())
  if (!m) return null
  return {
    appVersion: m[1],
    platform: m[2] as NativeAppInfo['platform'],
    bridgeVersion: Number(m[3]),
  }
}

/** 주입 객체 대기 — ready 대기는 장기 실행 호출이어도 기본 시한으로 캡한다. */
function waitForBridge(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FlutterBridge> {
  const host = bridgeHost()
  if (!host) {
    return Promise.reject(new BridgeError('INTERNAL', '창 컨텍스트가 없어 브리지를 열 수 없습니다.'))
  }
  const existing = host.flutter_inappwebview
  if (existing) return Promise.resolve(existing)

  return new Promise<FlutterBridge>((resolve, reject) => {
    const timer = setTimeout(() => {
      host.removeEventListener(PLATFORM_READY_EVENT, onReady)
      reject(new BridgeError('TIMEOUT', '브리지 준비 이벤트가 오지 않았습니다.'))
    }, timeoutMs)
    const onReady = () => {
      clearTimeout(timer)
      host.removeEventListener(PLATFORM_READY_EVENT, onReady)
      const bridge = host.flutter_inappwebview
      if (bridge) resolve(bridge)
      else reject(new BridgeError('INTERNAL', '준비 이벤트 후에도 브리지 객체가 없습니다.'))
    }
    host.addEventListener(PLATFORM_READY_EVENT, onReady)
  })
}

/** 봉투 해석 — 계약 밖 응답은 INTERNAL, 미지 에러 코드는 그대로 통과 */
function unwrap<T>(raw: unknown, method: string): T {
  if (typeof raw === 'object' && raw !== null && 'ok' in raw) {
    const res = raw as { ok: unknown; result?: unknown; code?: unknown; message?: unknown; detail?: unknown }
    if (res.ok === true) return res.result as T
    if (res.ok === false && typeof res.code === 'string') {
      throw new BridgeError(res.code, typeof res.message === 'string' ? res.message : undefined, res.detail)
    }
  }
  throw new BridgeError('INTERNAL', `브리지 응답이 계약과 다릅니다: ${method}`)
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, method: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BridgeError('TIMEOUT', `브리지 응답 시간 초과: ${method}`))
    }, timeoutMs)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export interface CallOptions {
  /** 기본 5000ms. 0 이하 = 무제한(저장·인가처럼 소요가 사용자·망에 비례하는 호출) */
  timeoutMs?: number
}

/** 저수준 RPC — 화면은 아래 타입드 메서드를 쓰고, 새 메서드가 생길 때만 직접 쓴다 */
export async function callBridge<T>(method: string, params?: unknown, opts: CallOptions = {}): Promise<T> {
  if (!isNativeApp()) {
    throw new BridgeError('UNSUPPORTED', `앱 밖에서는 브리지를 부를 수 없습니다: ${method}`)
  }
  const request: BridgeRequest = {
    v: BRIDGE_SCHEMA_VERSION,
    method,
    ...(params !== undefined ? { params } : {}),
  }
  const invoke = waitForBridge().then(async (bridge) => {
    let raw: unknown
    try {
      raw = await bridge.callHandler(HANDLER_NAME, request)
    } catch (err) {
      if (err instanceof BridgeError) throw err
      throw new BridgeError('INTERNAL', err instanceof Error ? err.message : `브리지 호출 실패: ${method}`)
    }
    return unwrap<T>(raw, method)
  })
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return timeoutMs > 0 ? withTimeout(invoke, timeoutMs, method) : invoke
}

/** 장기 실행 호출의 진행 스트림 열쇠 — 웹이 만들어 params.opId로 싣는다(계약 §2.3) */
export function newOpId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface BridgeProgress {
  done: number
  total: number
}

/** 셸의 진행 이벤트 구독. 반환값을 호출하면 해제. 창 컨텍스트가 없으면 no-op. */
export function subscribeBridgeProgress(opId: string, onProgress: (p: BridgeProgress) => void): () => void {
  const host = bridgeHost()
  if (!host) return () => {}
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as Partial<BridgeProgressEvent> | undefined
    if (!detail || detail.type !== 'progress' || detail.opId !== opId) return
    if (typeof detail.done !== 'number' || typeof detail.total !== 'number') return
    onProgress({ done: detail.done, total: detail.total })
  }
  host.addEventListener(EVENT_NAME, listener)
  return () => host.removeEventListener(EVENT_NAME, listener)
}

// capability는 세션당 1회 조회 — 실패는 캐시하지 않는다(일시 실패가 기능을 영영 숨기지 않게).
let capabilitiesCache: Promise<CapabilitiesResult> | null = null

export function getCapabilities(): Promise<CapabilitiesResult> {
  if (!capabilitiesCache) {
    capabilitiesCache = callBridge<CapabilitiesResult>('getCapabilities').catch((err) => {
      capabilitiesCache = null
      throw err
    })
  }
  return capabilitiesCache
}

/**
 * 기능 분기 단일 창구 — 앱이 아니거나 조회가 실패하면 false(웹 경로 폴백).
 * 구버전 앱 호환은 웹이 소유한다(계약 §1-6): 목록에 없으면 그 기능을 숨기거나 웹 경로로.
 */
export async function hasCapability(name: string): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    return (await getCapabilities()).capabilities.includes(name)
  } catch {
    return false
  }
}

/** 테스트 전용 — capability 캐시 초기화 */
export function __resetBridgeStateForTest(): void {
  capabilitiesCache = null
}

// ── 계약 §2.5 타입드 메서드 ──────────────────────────────────────────────
// 인가·저장은 소요가 사용자 행동·망 속도에 비례한다 — 시간 제한 없음(취소는 CANCELLED로 온다).

export function socialLogin(params: SocialLoginParams): Promise<SocialLoginResult> {
  return callBridge<SocialLoginResult>('socialLogin', params, { timeoutMs: 0 })
}

export function savePhotos(params: SavePhotosParams): Promise<SavePhotosResult> {
  return callBridge<SavePhotosResult>('savePhotos', params, { timeoutMs: 0 })
}

/** 권한 거부(PERMISSION_DENIED + detail.canOpenSettings) 안내 CTA용 */
export function openAppSettings(): Promise<void> {
  return callBridge<void>('openAppSettings')
}
