import { SIGNUP_AGREEMENT_ITEMS } from '../legal/signupAgreements'
import type { AgreementStatus } from '../types/api'

/**
 * 가입 동의 게이트 판정 (CHMO-479) — 로그인 성공 직후와 01-A 가입 동의 화면이 같은 규칙을 쓴다.
 *
 * - `consent`: 필수 항목에 미동의(신규 계정, 또는 문구 개정으로 재동의 대상)가 있다 → 01-A로.
 * - `stale`: 서버의 현재 버전과 FE 문구 버전이 다르다 → 이 앱이 보여줄 문구로는 동의를 기록할
 *   수 없다(제출해도 VALID400). 상정 케이스는 새 문구 배포 후 구버전 번들을 캐시로 들고 있는
 *   쪽이라 새로고침 안내로 빠진다 — FE가 앞선 경우(BE 미배포)도 제출이 거부되는 건 같아서
 *   한 갈래로 합친다.
 * - `pass`: 전부 현재 버전으로 동의돼 있다.
 *
 * 판정은 SIGNUP_AGREEMENT_ITEMS(FE가 실제로 수집하는 항목)를 기준으로 돈다 — 서버 목록 기준이
 * 아닌 이유 둘: ① GROUP 스코프(CHILD_CONSENT_ATTESTED)는 모임별이라 `agreed`가 항상 false다
 * (정본 §1 구현 주의 — required && !agreed로 세면 영영 못 지난다) ② MARKETING처럼 화면이
 * 그리지 않는 선택 항목은 게이트와 무관하다.
 */
export type ConsentGateVerdict = 'pass' | 'consent' | 'stale'

export function evaluateConsentGate(statuses: AgreementStatus[]): ConsentGateVerdict {
  let verdict: ConsentGateVerdict = 'pass'
  for (const item of SIGNUP_AGREEMENT_ITEMS) {
    const status = statuses.find((s) => s.scope === 'user' && s.type === item.type)
    // 서버 카탈로그에 없는 항목은 기록할 곳이 없다 — 막으면 영영 못 지나므로 건너뛴다(구계약 BE 안전망)
    if (!status) continue
    if (status.currentVersion !== item.version) return 'stale'
    if (!status.agreed) verdict = 'consent'
  }
  return verdict
}
