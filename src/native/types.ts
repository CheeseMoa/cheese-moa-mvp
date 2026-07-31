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

export type Capability = 'socialLogin' | 'savePhotos'

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
