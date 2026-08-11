/**
 * 푸시 알림 배선 (CHMO-667) — 화면은 이 모듈만 본다(브리지·devices API를 직접 부르지 않는다).
 *
 * 알림 2종(참여 신청 접수·사진 분류 완료 — BE CHMO-664)의 수신 경로는 **앱(FCM)뿐**이다.
 * 웹 푸시는 iOS가 홈 화면 추가를 전제해 MVP 경로가 아니다. 그래서 이 모듈의 모든 함수는
 * **브라우저에서 완전한 no-op**이고(`isPushSupported()` false), 기존 웹 동작은 그대로다.
 *
 * 세 층이 각자 다른 것을 결정한다 — 셋 다 만족해야 알림이 도착한다:
 *   ① OS 권한(기기)   — 사용자가 프롬프트에서 허용했는가. 이 모듈이 06-U에서 1회 묻는다
 *   ② 기기 토큰(기기) — 이 기기가 서버에 등록돼 있는가. 로그인·토큰 회전 때 등록한다
 *   ③ 수신 거부(계정) — 설정 '알림 받기'. 서버가 발송 시 필터한다(BE CHMO-664 AC-4)
 *
 * **실패는 전부 조용하다.** 알림은 보조 수단이라 등록이 실패해도 사용자 흐름을 막지 않고,
 * 해제가 실패해도 로그아웃은 진행한다(기존 `POST /auth/logout` 관용과 같은 결).
 * 그래서 이 모듈의 함수는 어느 것도 reject하지 않는다 — 호출부에 try/catch가 없다.
 */
import {
  getPushPermission,
  getPushToken,
  hasCapability,
  nativeAppInfo,
  requestPushPermission,
  subscribeBridgePushToken,
} from '../native/bridge'
import { registerDevice, unregisterDevice } from '../api/devices'
import { getAccessToken } from './auth'
import type { PushPermissionStatus } from '../native/types'

/**
 * 마지막으로 등록한 토큰 — 로그아웃 때 **무엇을 해제할지** 알기 위해 남긴다.
 * 계정이 아니라 기기의 값이라 계정 접미사를 붙이지 않는다(같은 기기에 다른 계정이
 * 로그인해도 FCM 토큰은 같다 — analytics optOut 플래그와 같은 이유).
 */
const TOKEN_KEY = 'cheesemoa.push.token'

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 저장 실패 — 이번 세션 등록은 됐고 다음 로그아웃에서 해제만 못 한다(서버가 UNREGISTERED로 정리) */
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* noop */
  }
}

/**
 * 이 실행 환경이 푸시를 받을 수 있는가 — 앱 웹뷰 + 셸이 push를 구현했는가.
 * 구버전 앱(capability 없음)에서도 false다: 하위 호환은 웹이 소유한다(계약 §1-6).
 * 설정 토글 노출 판정이기도 하다(AC-4 — 브라우저엔 토글이 없다).
 */
export function isPushSupported(): Promise<boolean> {
  return hasCapability('push')
}

/** 현재 OS 알림 권한 — 앱이 아니거나 조회가 실패하면 'denied'(켤 수 없는 상태로 수렴) */
export async function pushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!(await isPushSupported())) return 'denied'
  try {
    return (await getPushPermission()).status
  } catch {
    return 'denied'
  }
}

/**
 * 이 기기 토큰을 서버에 등록. 권한이 없으면 토큰 자체가 없어 조용히 끝난다.
 * 로그인 직후·토큰 회전·권한 허용 직후 — 세 자리에서 부르고 **멱등**이라 중복 호출이 정상이다.
 */
async function registerCurrentToken(): Promise<void> {
  // 등록은 인증이 필요하다 — 토큰이 없으면 401이 날 뿐이라 아예 부르지 않는다
  if (!getAccessToken()) return
  const app = nativeAppInfo()
  if (!app) return
  try {
    const { token } = await getPushToken()
    if (!token) return
    await registerDevice({ token, platform: app.platform })
    writeStoredToken(token)
  } catch {
    /* 등록 실패 = 알림이 안 올 뿐 — 다음 로그인·토큰 회전에서 다시 시도된다 */
  }
}

/**
 * 로그인 성공 직후 (AC-1). 권한을 **묻지 않는다** — 여기서 물으면 알림이 왜 필요한지
 * 근거가 없는 자리라 거부율이 높고, iOS는 그 거부가 영구적이다(복구는 설정 앱뿐).
 * 이미 허용된 기기(재로그인·다른 계정)의 토큰만 조용히 등록한다.
 */
export async function registerPushOnLogin(): Promise<void> {
  if (!(await isPushSupported())) return
  if ((await pushPermissionStatus()) !== 'granted') return
  await registerCurrentToken()
}

/**
 * 로그아웃·계정 삭제 시 이 기기 해제 (AC-1).
 * **로컬 토큰은 서버 호출 성공 여부와 무관하게 지운다** — 로그아웃은 되돌아오지 않고,
 * 서버에 남은 유령 토큰은 발송 때 FCM이 `UNREGISTERED`로 알려 줘 BE가 정리한다.
 * 호출 순서 주의: 인증이 필요하므로 `clearAuthTokens()` **앞**에서 불러야 한다.
 */
export async function unregisterPushOnLogout(): Promise<void> {
  const token = readStoredToken()
  clearStoredToken()
  if (!token || !getAccessToken()) return
  try {
    await unregisterDevice(token)
  } catch {
    /* 해제 실패가 로그아웃을 막지 않는다 */
  }
}

/**
 * 계정 삭제 성공 후 — 서버 행은 계정과 함께 사라졌으니 로컬 흔적만 지운다.
 * 해제 API를 부르지 않는 이유: 부를 계정이 이미 없다(401).
 */
export function forgetPushTokenAfterAccountDelete(): void {
  clearStoredToken()
}

/**
 * OS 권한 프롬프트 — **06-U 업로드를 시작한 직후 한 번**(CHMO-667 착수 결정).
 *
 * 그 자리인 이유: 사진을 올려 두고 분류를 기다리는 순간이 "끝나면 알려드릴 테니 앱을
 * 닫으셔도 돼요"가 사실이 되는 유일한 자리다. 앱 첫 실행·로그인 직후에 물으면 알림의
 * 근거가 없어 거부율이 높은데, iOS 프롬프트는 1회성이라 그 거부가 영구적이다.
 *
 * "1회"는 로컬 플래그가 아니라 **OS 권한 상태가 판정한다** — 이미 결정된 기기는
 * `undetermined`가 아니라서 프롬프트가 뜨지 않는다. 별도 플래그를 두면 OS와 두 벌이 되고,
 * 앱 재설치로 권한이 초기화됐을 때 플래그만 남아 영영 못 묻는 상태가 된다.
 *
 * 실패·거부 모두 조용하다 — 업로드 흐름에 얹힌 곁가지라 화면에 아무것도 알리지 않는다.
 */
export async function requestPushPermissionAfterUpload(): Promise<void> {
  if (!(await isPushSupported())) return
  const current = await pushPermissionStatus()
  // granted: 물을 것이 없고 등록만 확인 / denied: 다시 물어도 프롬프트가 뜨지 않는다
  if (current === 'granted') {
    await registerCurrentToken()
    return
  }
  if (current !== 'undetermined') return
  try {
    const { status } = await requestPushPermission()
    if (status === 'granted') await registerCurrentToken()
  } catch {
    /* 프롬프트를 못 띄웠다 — 다음 업로드에서 다시 시도된다(상태가 여전히 undetermined) */
  }
}

/**
 * FCM 토큰 회전 구독 — main.tsx에서 앱 생애 1회.
 * 토큰은 앱 재설치·데이터 삭제·장기 미사용으로 서버 통보 없이 갈리는데, 갱신을 받아
 * 다시 등록하지 않으면 그 계정의 알림이 **조용히** 끊긴다(발송은 성공하고 도착만 안 한다).
 * 브라우저에서는 이벤트가 오지 않아 구독만 걸리고 아무 일도 일어나지 않는다.
 */
export function startPushTokenSync(): () => void {
  return subscribeBridgePushToken((token) => {
    if (!getAccessToken()) return
    const app = nativeAppInfo()
    if (!app) return
    void registerDevice({ token, platform: app.platform })
      .then(() => writeStoredToken(token))
      .catch(() => {
        /* 회전 등록 실패 — 다음 로그인에서 복구된다 */
      })
  })
}
