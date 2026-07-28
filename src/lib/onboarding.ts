/**
 * 첫 사용 온보딩(00) 노출 판정 (CHMO-481) — 완료 여부는 이 기기에만 남는다.
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
 * 로그인 성공 후 목적지.
 * returnTo(초대 링크에 가로막혀 로그인한 경우 등)가 있으면 그 흐름을 온보딩이 끊지 않는다 —
 * 참여를 마치고 다음 로그인 때 보여주면 된다.
 */
export function postLoginDestination(returnTo?: string | null): string {
  if (returnTo) return returnTo
  return hasSeenOnboarding() ? '/home' : '/onboarding'
}
