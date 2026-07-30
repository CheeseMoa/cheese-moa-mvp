/**
 * 첫 사용 안내 노출 판정 (CHMO-481 → CHMO-504) — 완료 여부는 이 기기에만 남는다.
 *
 * 무엇을 띄우느냐는 바뀌었다: 슬라이드 3장(00)은 **일단 노출하지 않고**(2026-07-28 사용자 결정)
 * 첫 로그인엔 치즈모아 둘러보기(00-T)를 홈에서 연다. 판정 플래그는 그대로 공유한다 —
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

// ── 둘러보기 갈래 힌트 (CHMO-504) ──────────────────────────────
// 투어 첫 장은 "선생님/학부모 어느 쪽으로 오셨나요?"를 묻는다. 초대 링크로 합류한 사람은
// 그 답을 이미 행동으로 말했으므로(학부모 링크로 자녀 이름까지 적었거나 선생님 키로 신청했다)
// 다시 묻지 않는다. 자동 노출이 참여 흐름 다음 방문으로 밀리는 탓에 navigate state로는
// 전달되지 않아 로컬에 남긴다 — 없으면 첫 장에서 직접 고르는 원래 동작이라 실패해도 무해하다.
//
// role은 계정 속성이 아니라 멤버십(모임별) 속성이다 — 이건 "이 사람이 처음 들어온 문이
// 어느 쪽이었나"를 기억하는 화면 힌트일 뿐, 계정에 역할을 박는 게 아니다.

export type TourTrack = 'teacher' | 'parent'

const TRACK_KEY_PREFIX = 'cheesemoa.tourTrack.'

function trackKey(): string {
  return `${TRACK_KEY_PREFIX}${getCurrentUserId() ?? 'unknown'}`
}

export function setPreferredTourTrack(track: TourTrack): void {
  try {
    localStorage.setItem(trackKey(), track)
  } catch {
    /* 힌트 저장 실패 — 투어 첫 장에서 직접 고르면 된다 */
  }
}

export function getPreferredTourTrack(): TourTrack | null {
  try {
    const stored = localStorage.getItem(trackKey())
    return stored === 'teacher' || stored === 'parent' ? stored : null
  } catch {
    return null
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
