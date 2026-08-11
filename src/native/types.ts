/**
 * 앱(Flutter 웹뷰) 브리지 계약 v1 타입 (CHMO-537).
 *
 * 계약 원천은 앱 리포 `CheeseMoa-App/docs/app-shell-spec.md` §2 (CHMO-535) —
 * 여기 타입을 바꾸려면 그 문서와 Flutter 셸이 함께 움직여야 한다. 임의 변경 금지.
 * 하위 호환은 웹이 소유한다: 앱은 구버전이 잔존하므로 capability 유무로 분기하고,
 * 미지 에러 코드는 통과시킨다(api/errors.ts와 같은 관용 — 단 네임스페이스는 별개다).
 */

export const BRIDGE_SCHEMA_VERSION = 1

export type BridgePlatform = 'ios' | 'android'

/** UA 마커 ` CheeseMoaApp/{appVersion} ({ios|android}) Bridge/{v}` 파싱 결과 */
export interface NativeAppInfo {
  appVersion: string
  platform: BridgePlatform
  bridgeVersion: number
}

export interface BridgeRequest {
  v: number
  method: string
  params?: unknown
}

export type BridgeResponse =
  | { ok: true; result?: unknown }
  | { ok: false; code: string; message?: string; detail?: unknown }

/** 계약 §2.4 — 셸이 보내는 코드. 미지 코드는 이 유니온 밖이어도 통과한다. */
export type BridgeErrorCode =
  | 'UNSUPPORTED'
  | 'CANCELLED'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'INTERNAL'

export type Capability = 'socialLogin' | 'savePhotos' | 'push'

export interface CapabilitiesResult {
  v: number
  platform: BridgePlatform
  appVersion: string
  capabilities: string[]
}

export type SocialProvider = 'kakao' | 'google' | 'naver' | 'apple'

export interface SocialLoginParams {
  provider: SocialProvider
  /** 웹이 조립한다({API_ORIGIN}/auth/social/{provider}) — BE 오리진은 웹 소유 */
  authorizeUrl: string
}

export interface SocialLoginResult {
  /** BE가 복귀시킨 `/auth/callback?code=…`(또는 `?error=…`) 전체 URL */
  callbackUrl: string
}

export interface SavePhotoItem {
  url: string
  fileName?: string
}

export interface SavePhotosParams {
  /** 진행 이벤트 스트림과 응답 Promise를 잇는 열쇠 — 웹이 생성한다(newOpId) */
  opId: string
  photos: SavePhotoItem[]
}

export interface SavePhotosResult {
  saved: number
  failed: { url: string; code: string }[]
}

/** 셸 → 웹 CustomEvent('cheesemoa:event')의 detail */
export interface BridgeProgressEvent {
  v: number
  type: 'progress'
  opId: string
  done: number
  total: number
}

// ── 푸시 (CHMO-667) ──────────────────────────────────────────────────────

/**
 * OS 알림 권한 상태 (계약 §2.5 — 셸 CHMO-666).
 * `notDetermined`만 아직 물어볼 수 있다 — iOS는 한 번 거부되면 앱이 프롬프트를 다시 못 띄우고
 * 설정 앱으로만 복구되므로, 웹은 `denied`를 "물어볼 상태"가 아니라 "설정으로 보낼 상태"로 읽는다.
 * `provisional`은 iOS의 조용한 알림 허용(배너 없이 알림 센터로) — **발송은 도달하므로 웹은
 * granted와 같이 취급한다**(끄고 싶으면 수신 거부 토글이 있다).
 */
export type PushPermissionStatus = 'granted' | 'denied' | 'notDetermined' | 'provisional'

/**
 * `requestPushPermission`·`getPushToken` 공통 응답 — 둘 다 상태와 토큰을 함께 준다.
 * **권한 거부는 에러가 아니라 `status`다**(계약 §2.5 — 사용자가 답을 준 정상 왕복).
 */
export interface PushPermissionResult {
  status: PushPermissionStatus
  /**
   * FCM 등록 토큰. **허용됐어도 없을 수 있다**(iOS APNs 등록 전) — 그때는 `status`만 오고
   * 토큰은 `pushToken` 이벤트로 따라온다. 그래서 웹은 **두 경로 모두에서** 서버 등록을 한다.
   */
  token?: string
}

/**
 * 셸 → 웹 CustomEvent('cheesemoa:event')의 detail — FCM 토큰 회전.
 * FCM 토큰은 앱 재설치·데이터 삭제·장기 미사용으로 서버 통보 없이 갈린다. 갱신을 받아
 * 다시 등록하지 않으면 그 계정의 알림이 조용히 끊긴다(발송은 성공하는데 도착하지 않는다).
 * `opId`가 없다 — 특정 호출의 진행이 아니라 앱 생애 내내 오는 브로드캐스트다.
 */
export interface BridgePushTokenEvent {
  v: number
  type: 'pushToken'
  token: string
}
