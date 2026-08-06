/**
 * 목 소셜 계정 정보의 단일 원천 (CHMO-602) — UI(api MSW 분기)·목 핸들러·persist가 공유한다
 * (upload.ts·pin.ts 관용). MSW 목 모드 전용 값이라 실 BE 경로에서는 아무도 읽지 않는다.
 *
 * 소셜 가입 유예(BE CHMO-598의 소셜판)에서 "신규인가"의 판정은 콜백 URL을 만드는 시점에
 * 필요하다(`signup=true`를 실을지) — 실 BE는 소셜 신원 조회로 정하지만, 목 모드는 서비스워커가
 * 문서 내비게이션을 못 가로채 URL 생성이 FE 코드(socialLoginStartUrl)에서 일어난다. 그래서
 * 판정 원천을 목 가입 계정 보존소(persist.ts localStorage)로 둔다 — 별도 플래그를 두면
 * DELETE /me·재시드와 어긋날 수 있지만, 보존소는 계정의 생성·삭제를 이미 따라간다.
 * api 계층이 mocks를 import하지 않는 이유: 목 DB·픽스처가 프로덕션 번들에 딸려 온다.
 */

/** persist.ts 가입 계정 보존소 키 — 쓰기는 persist.ts만, 여기서는 읽기 전용 */
export const MOCK_USERS_STORAGE_KEY = 'cheesemoa.mock.users'

/** 소셜 로그인 목 계정 닉네임 — provider별 1개 고정 (CHMO-359) */
export const SOCIAL_MOCK_NICKNAMES: Record<string, string> = {
  kakao: '카카오테스트',
  google: '구글테스트',
  naver: '네이버테스트',
  apple: '애플테스트',
}

/**
 * 그 프로바이더의 목 계정이 이미 가입돼 있나 — false면 콜백 URL에 `signup=true`가 실린다.
 * localStorage 불가 환경(프라이빗 모드)은 항상 신규로 판정되지만, 목 exchange가 기존 계정을
 * 찾으면 그대로 로그인시키므로 흐름이 막히지는 않는다.
 */
export function isMockSocialRegistered(provider: string): boolean {
  const nickname = SOCIAL_MOCK_NICKNAMES[provider]
  if (!nickname) return false
  try {
    const raw = localStorage.getItem(MOCK_USERS_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return false
    return parsed.some((u) => (u as { nickname?: unknown })?.nickname === nickname)
  } catch {
    return false
  }
}
