import { describe, expect, it } from 'vitest'
import {
  JOIN_KEY_MAX,
  JOIN_PASSWORD_MAX,
  joinKeyFormatError,
  joinPasswordFormatError,
  sanitizeJoinSecretInput,
} from './joinSecret'

/**
 * 참여 코드·비밀번호 형식 규칙(CHMO-677 · BE CHMO-673 @Pattern의 거울).
 * 화면과 목이 같은 판정을 쓰는지가 요점 — 어긋나면 화면은 통과시키고 서버가 VALID400을 준다.
 */
describe('참여 코드 형식', () => {
  it('영문·숫자 4~20자만 통과한다', () => {
    expect(joinKeyFormatError('familytrip')).toBeNull()
    expect(joinKeyFormatError('KPTXQA')).toBeNull()
    expect(joinKeyFormatError('a1b2')).toBeNull()
    expect(joinKeyFormatError('a'.repeat(JOIN_KEY_MAX))).toBeNull()
  })

  it('짧거나·길거나·허용 밖 문자가 섞이면 문구를 준다', () => {
    expect(joinKeyFormatError('abc')).not.toBeNull()
    expect(joinKeyFormatError('a'.repeat(JOIN_KEY_MAX + 1))).not.toBeNull()
    expect(joinKeyFormatError('family trip')).not.toBeNull()
    expect(joinKeyFormatError('family-trip')).not.toBeNull()
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
  it('허용 밖 문자를 걷고 상한까지 자른다 — 대소문자는 보존한다(구분 매칭 CHMO-285)', () => {
    expect(sanitizeJoinSecretInput('Family Trip!', JOIN_KEY_MAX)).toBe('FamilyTrip')
    expect(sanitizeJoinSecretInput('가족trip2026', JOIN_KEY_MAX)).toBe('trip2026')
    expect(sanitizeJoinSecretInput('a'.repeat(30), JOIN_KEY_MAX)).toHaveLength(JOIN_KEY_MAX)
    expect(sanitizeJoinSecretInput('abcdefghijklmno', JOIN_PASSWORD_MAX)).toHaveLength(
      JOIN_PASSWORD_MAX,
    )
  })
})
