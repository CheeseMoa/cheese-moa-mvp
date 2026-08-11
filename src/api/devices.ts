/**
 * 푸시 기기 토큰 등록·해제 (CHMO-667 · BE CHMO-664).
 *
 * 한 계정이 여러 기기를 가질 수 있어 **토큰이 곧 기기의 식별자**다(userId가 아니라).
 * 그래서 해제도 토큰을 경로에 싣는다 — 로그아웃한 이 기기만 빠지고 다른 기기는 남는다.
 *
 * 이 계층의 두 호출은 **실패해도 사용자 흐름을 막지 않는다**(호출부가 전부 조용히 삼킨다):
 * 등록이 실패하면 알림이 안 올 뿐이고, 해제가 실패하면 로그아웃은 그대로 진행된다
 * (기존 `POST /auth/logout` 관용과 같은 결 — 서버 실패에도 로컬은 진행).
 * 서버에 남은 유령 토큰은 발송 때 FCM이 `UNREGISTERED`로 알려 줘 BE가 정리한다.
 */
import { apiFetch } from './client'
import type { BridgePlatform } from '../native/types'

export interface RegisterDeviceInput {
  token: string
  platform: BridgePlatform
}

/**
 * POST /me/devices — 이 기기의 FCM 토큰 등록(성공 201).
 * 같은 토큰을 다시 보내도 안전하다(멱등) — 토큰 회전·재로그인마다 부르므로 중복이 정상이고,
 * **다른 계정이 같은 토큰을 등록하면 소유가 이전된다**(BE `RegisterDeviceUseCase` — 한 기기에
 * A가 로그아웃하고 B가 로그인하면 A 앞으로 온 알림이 B 화면에 뜨면 안 된다).
 *
 * `platform`은 BE `DevicePlatform` enum이라 **대문자**여야 한다(2026-08-11 BE 소스 대조 —
 * Jackson enum 역직렬화는 대소문자를 가려서 소문자면 400이다). FE 내부 값은 브리지 UA가 주는
 * 소문자 그대로 두고 경계에서만 올린다 — 대문자 enum 흡수는 매퍼·도메인 모듈 몫이라는 관례.
 */
export async function registerDevice(input: RegisterDeviceInput): Promise<void> {
  await apiFetch<unknown>('/me/devices', {
    method: 'POST',
    body: { token: input.token, platform: input.platform.toUpperCase() },
  })
}

/**
 * DELETE /me/devices/{token} — 이 기기 해제(로그아웃·계정 삭제·수신 거부 아님).
 * 이미 없는 토큰도 성공으로 수렴한다(멱등) — 해제는 되돌릴 일이 없어 404를 구분할 실익이 없다.
 * ⚠ 토큰은 경로 세그먼트라 인코딩이 필요하다: FCM 토큰에 `/`가 섞이면 경로가 갈라진다.
 */
export async function unregisterDevice(token: string): Promise<void> {
  await apiFetch<unknown>(`/me/devices/${encodeURIComponent(token)}`, { method: 'DELETE' })
}
