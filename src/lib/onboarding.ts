/**
 * 첫 사용 안내 노출 판정 (CHMO-481 → CHMO-504 → CHMO-565) — 완료 여부는 이 기기에만 남는다.
 *
 * 자동으로 뜨는 첫 안내는 없다(CHMO-565, 2026-08-03): 슬라이드 3장(00)은 노출 중단 상태 그대로,
 * 둘러보기(00-T)의 첫 로그인 자동 노출도 폐지했다 — NN/g 실험(선행 튜토리얼은 과업 성공률을
 * 못 올리고 체감 난이도만 악화)과 완주율 데이터(자동 노출 39% vs 스스로 연 투어 67%)가 근거.
 * 안내는 코치 힌트(아래)가 실제 화면의 낯선 지점에서 1회 맡고, 둘러보기는 설정의 pull 전용이다.
 *
 * `onboarded` 플래그는 이제 아무도 읽지 않지만 기록은 유지한다 — 슬라이드(00)를 되살릴 때
 * "이미 첫 안내를 본 사람"을 가르는 판정 원천이라 지우면 그때 전원에게 다시 뜬다.
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

// ── 코치 힌트 노출 기록 (CHMO-565) ──────────────────────────────
// 자동 투어를 대신하는 그 자리 1회 안내(CoachHint) — "이 계정이 이 힌트를 봤는가"를 힌트
// id 단위로 남긴다. 기록 시점은 투어와 같은 '뜰 때'다: 닫을 때 남기면 새로고침·이탈로
// 1회 보장이 깨진다(CHMO-504와 같은 결정). 놓친 사람의 재진입은 설정 둘러보기가 맡는다.

const HINT_KEY_PREFIX = 'cheesemoa.coachHint.'

function hintKey(id: string): string {
  return `${HINT_KEY_PREFIX}${id}.${getCurrentUserId() ?? 'unknown'}`
}

export function hasSeenCoachHint(id: string): boolean {
  try {
    return localStorage.getItem(hintKey(id)) !== null
  } catch {
    // 저장소를 못 쓰면 1회를 보장할 방법도 없다 — 매번 띄우느니 숨긴다(보조 수단이라 무해)
    return true
  }
}

export function markCoachHintSeen(id: string): void {
  try {
    localStorage.setItem(hintKey(id), '1')
  } catch {
    /* 저장 실패 — 다음 방문에 한 번 더 보일 뿐 */
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
