import { describe, expect, it } from 'vitest'
import { evaluateConsentGate } from './consentGate'
import { SIGNUP_AGREEMENT_ITEMS } from '../legal/signupAgreements'
import type { AgreementStatus } from '../types/api'

/**
 * 가입 동의 게이트 판정 (CHMO-479) — 로그인 직후·01-A가 같은 규칙으로 갈라지는 자리라
 * 세 갈래(pass/consent/stale)와 정본 §1의 함정(GROUP 스코프 agreed 항상 false)을 고정한다.
 */

/** FE가 수집하는 4종 전부 현재 버전으로 동의된 상태 */
function allAgreed(): AgreementStatus[] {
  return SIGNUP_AGREEMENT_ITEMS.map((item) => ({
    type: item.type,
    currentVersion: item.version,
    required: true,
    scope: 'user' as const,
    agreed: true,
  }))
}

describe('evaluateConsentGate (CHMO-479)', () => {
  it('전부 현재 버전으로 동의돼 있으면 pass — 게이트를 거치지 않는다', () => {
    expect(evaluateConsentGate(allAgreed())).toBe('pass')
  })

  it('필수 항목 미동의가 하나라도 있으면 consent — 신규 계정·재동의 대상', () => {
    const statuses = allAgreed()
    statuses[0] = { ...statuses[0], agreed: false }
    expect(evaluateConsentGate(statuses)).toBe('consent')
  })

  it('GROUP 스코프(보호자 확인)는 agreed가 항상 false여도 게이트에 세지 않는다 — 정본 §1 함정', () => {
    const statuses: AgreementStatus[] = [
      ...allAgreed(),
      {
        type: 'child_consent_attested',
        currentVersion: '1.0',
        required: true,
        scope: 'group',
        agreed: false,
      },
    ]
    expect(evaluateConsentGate(statuses)).toBe('pass')
  })

  it('화면이 그리지 않는 선택 항목(MARKETING)은 미동의여도 게이트와 무관하다', () => {
    const statuses: AgreementStatus[] = [
      ...allAgreed(),
      { type: 'marketing', currentVersion: '1.0', required: false, scope: 'user', agreed: false },
    ]
    expect(evaluateConsentGate(statuses)).toBe('pass')
  })

  it('서버 버전이 FE 문구 버전과 다르면 stale — 미동의가 함께 있어도 새로고침 안내가 먼저다', () => {
    const statuses = allAgreed()
    statuses[1] = { ...statuses[1], currentVersion: '9.9', agreed: false }
    statuses[2] = { ...statuses[2], agreed: false }
    // 구버전 문구로 체크를 받아도 제출이 VALID400으로 거부되므로 stale이 consent를 이긴다
    expect(evaluateConsentGate(statuses)).toBe('stale')
  })

  it('서버 카탈로그에 없는 항목은 건너뛴다 — 기록할 곳이 없는 항목으로 막지 않는다(구계약 BE 안전망)', () => {
    const statuses = allAgreed().slice(1)
    expect(evaluateConsentGate(statuses)).toBe('pass')
  })

  it('빈 응답(구계약 BE — 동의 API 자체가 없던 시절)이면 pass — 게이트가 열려 있어야 한다', () => {
    expect(evaluateConsentGate([])).toBe('pass')
  })
})
