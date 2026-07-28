/**
 * 첫 사용 안내 노출 판정 (CHMO-481 → CHMO-504) — 완료 여부는 이 기기에만 남는다.
 *
 * 무엇을 띄우느냐는 바뀌었다: 슬라이드 3장(00)은 **일단 노출하지 않고**(2026-07-28 사용자 결정)
 * 첫 로그인엔 앱 구조 둘러보기(00-T)를 홈에서 연다. 판정 플래그는 그대로 공유한다 —
 * "이 계정이 첫 안내를 봤는가" 하나면 되고, 둘을 따로 세면 슬라이드를 되살릴 때 이미 본
 * 사람에게 다시 뜬다.
 *
 * BE는 신규 가입 여부를 알려주지 않는다(AuthResponse는 userId·토큰 평면 필드고 소셜 교환도
 * 신규·기존을 구분해 주지 않는다). 그래서 "처음 온 사람인가"를 서버로는 판정할 수 없고,
 * 로그인 계정별 로컬 플래그로 대신한다. 다른 계정으로 로그인하면 다시 뜨고, 기기·브라우저가
 * 바뀌면 다시 뜨는 것은 감수한다 — 계정 단위 서버 저장은 BE 협의 후속(screen-spec §5-6).
 */
import { getCurrentUserId } from './auth'

const SEEN_KEY_PREFIX = 'cheesemoa.onboarded.'

/** 계정별 키 — userId를 못 읽는 세션(저장 실패 등)은 공용 키 하나로 모은다 */
function seenKey(): string {
  return `${SEEN_KEY_PREFIX}${getCurrentUserId() ?? 'unknown'}`
}

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(seenKey()) !== null
  } catch {
    // 저장소를 못 쓰면 완료를 기록할 방법도 없다 — 매 로그인마다 띄우느니 건너뛴다(차단 화면이 아니다)
    return true
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(seenKey(), '1')
  } catch {
    /* 저장 실패 — 다음 로그인에 한 번 더 보일 뿐이라 그대로 진행한다 */
  }
}

/**
 * 로그인 성공 후 목적지 — 언제나 홈이다.
 *
 * 첫 안내는 더 이상 별도 화면(/onboarding 슬라이드)으로 가로채지 않는다: 홈에 도착한 뒤
 * 홈 위에서 둘러보기(00-T)가 열린다. 로그인 → 빈 화면 → 슬라이드로 튕기는 대신 자기 앱에
 * 먼저 도착시키는 편이 낫고, returnTo(초대 링크 등)가 있으면 그 흐름이 그대로 우선한다.
 */
export function postLoginDestination(returnTo?: string | null): string {
  return returnTo || '/home'
}
