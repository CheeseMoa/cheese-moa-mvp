import { describe, expect, it } from 'vitest'
import {
  JOIN_KEY_MAX,
  JOIN_PASSWORD_MAX,
  joinKeyFormatError,
  joinPasswordFormatError,
  sanitizeJoinKeyInput,
  sanitizeJoinSecretInput,
} from './joinSecret'

/**
 * 참여 코드·비밀번호 형식 규칙(CHMO-677 · BE CHMO-673 @Pattern의 거울).
 * 화면과 목이 같은 판정을 쓰는지가 요점 — 어긋나면 화면은 통과시키고 서버가 VALID400을 준다.
 */
describe('참여 코드 형식', () => {
  it('영문 대문자·숫자 4~20자만 통과한다', () => {
    expect(joinKeyFormatError('FAMILYTRIP')).toBeNull()
    expect(joinKeyFormatError('KPTXQA')).toBeNull()
    expect(joinKeyFormatError('A1B2')).toBeNull()
    expect(joinKeyFormatError('A'.repeat(JOIN_KEY_MAX))).toBeNull()
  })

  it('소문자는 막는다 — 대문자 전용으로 좁혔다(CHMO-680)', () => {
    expect(joinKeyFormatError('familytrip')).not.toBeNull()
    // 한 글자만 소문자여도 매칭이 어긋난다(BE는 case-sensitive 조회)
    expect(joinKeyFormatError('FAMILYTRIp')).not.toBeNull()
  })

  it('짧거나·길거나·허용 밖 문자가 섞이면 문구를 준다', () => {
    expect(joinKeyFormatError('ABC')).not.toBeNull()
    expect(joinKeyFormatError('A'.repeat(JOIN_KEY_MAX + 1))).not.toBeNull()
    expect(joinKeyFormatError('FAMILY TRIP')).not.toBeNull()
    expect(joinKeyFormatError('FAMILY-TRIP')).not.toBeNull()
  })

  it('한글은 막는다 — 정규화(NFC/NFD) 차이로 같은 글자가 다른 값이 된다(BE 70e889e)', () => {
    expect(joinKeyFormatError('가족여행')).not.toBeNull()
    // 자모 조합형(NFD)과 완성형(NFC)은 눈으로 같지만 문자열이 다르다 — 둘 다 애초에 거부한다
    expect(joinKeyFormatError('가족여행'.normalize('NFD'))).not.toBeNull()
  })
})

describe('참여 비밀번호 형식', () => {
  it('영문·숫자 4~12자 — 자동 발급 4자리 숫자도 그대로 유효하다', () => {
    expect(joinPasswordFormatError('4821')).toBeNull()
    expect(joinPasswordFormatError('banana12')).toBeNull()
    expect(joinPasswordFormatError('a'.repeat(JOIN_PASSWORD_MAX))).toBeNull()
    expect(joinPasswordFormatError('abc')).not.toBeNull()
    expect(joinPasswordFormatError('a'.repeat(JOIN_PASSWORD_MAX + 1))).not.toBeNull()
    expect(joinPasswordFormatError('바나나12')).not.toBeNull()
  })
})

describe('입력 정제', () => {
  it('허용 밖 문자를 걷고 상한까지 자른다 — 케이스는 보존한다(비밀번호가 쓰는 경로)', () => {
    expect(sanitizeJoinSecretInput('Family Trip!', JOIN_KEY_MAX)).toBe('FamilyTrip')
    expect(sanitizeJoinSecretInput('가족trip2026', JOIN_KEY_MAX)).toBe('trip2026')
    expect(sanitizeJoinSecretInput('a'.repeat(30), JOIN_KEY_MAX)).toHaveLength(JOIN_KEY_MAX)
    expect(sanitizeJoinSecretInput('abcdefghijklmno', JOIN_PASSWORD_MAX)).toHaveLength(
      JOIN_PASSWORD_MAX,
    )
  })
})

/**
 * 참여 코드 입력만 대문자로 올린다(CHMO-680) — 소문자로 받아 적은 코드가 SPACE404로 떨어지던
 * 실패를 입력 시점에 없앤다. 비밀번호는 이 경로를 타지 않는다(위 정제 그대로).
 */
describe('참여 코드 입력 대문자 변환', () => {
  it('소문자를 올리고, 허용 밖 문자는 그대로 걷는다', () => {
    expect(sanitizeJoinKeyInput('kptxqa')).toBe('KPTXQA')
    expect(sanitizeJoinKeyInput('family trip!')).toBe('FAMILYTRIP')
    expect(sanitizeJoinKeyInput('가족trip2026')).toBe('TRIP2026')
  })

  it('이미 대문자면 그대로 두고, 상한을 넘기지 않는다', () => {
    expect(sanitizeJoinKeyInput('KPTXQA')).toBe('KPTXQA')
    expect(sanitizeJoinKeyInput('a'.repeat(30))).toHaveLength(JOIN_KEY_MAX)
    // 대문자화가 글자 수를 늘리는 문자(ß→SS)는 정제가 먼저 걷어 상한을 넘길 수 없다
    expect(sanitizeJoinKeyInput('ß'.repeat(30))).toBe('')
  })

  it('올린 값은 형식 검사를 통과한다 — 정제와 판정이 같은 규칙을 본다', () => {
    expect(joinKeyFormatError(sanitizeJoinKeyInput('familytrip'))).toBeNull()
    expect(joinKeyFormatError(sanitizeJoinKeyInput('family trip!'))).toBeNull()
  })
})
