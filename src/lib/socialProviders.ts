import type { SocialProvider } from '../api/auth'
import { nativeAppInfo } from '../native/bridge'

/**
 * 소셜 로그인 버튼 노출 규칙 단일 원천 (CHMO-551).
 * Apple 로그인은 iOS 심사 요건(4.8 Login Services) 대응용이라 **Android 앱 웹뷰에서만** 숨긴다 —
 * iOS 앱 웹뷰(4.8, 절대 숨기지 않는다)·일반 브라우저(모바일웹·데스크톱)는 4종 그대로.
 * 판정은 UA 마커의 platform 하나다. 마커가 있어도 형식이 달라 platform을 모르면
 * 노출을 유지한다 — 잘못 숨긴 쪽(iOS 심사 반려)이 잘못 보인 쪽보다 비싸다.
 */
export function isSocialProviderVisible(provider: SocialProvider): boolean {
  if (provider !== 'apple') return true
  return nativeAppInfo()?.platform !== 'android'
}
