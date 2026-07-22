import { describe, expect, it } from 'vitest'
import { toFeErrorCode } from './errors'
import { BE_ERRORS } from '../test/fixtures/be'

describe('toFeErrorCode', () => {
  it('같은 401이라도 로그인 실패와 토큰 무효를 구분한다', () => {
    expect(toFeErrorCode(BE_ERRORS.AUTH401.payload.code)).toBe('INVALID_CREDENTIALS')
    expect(toFeErrorCode(BE_ERRORS.COMMON401.payload.code)).toBe('UNAUTHORIZED')
  })

  it('나머지 매핑도 api-spec 의미 코드로 옮긴다', () => {
    expect(toFeErrorCode('AUTH400')).toBe('INVALID_PIN')
    expect(toFeErrorCode(BE_ERRORS.JOIN403.payload.code)).toBe('WRONG_PASSWORD')
    expect(toFeErrorCode(BE_ERRORS.SPACE404.payload.code)).toBe('NOT_FOUND')
    expect(toFeErrorCode('MOMENT404')).toBe('NOT_FOUND')
    expect(toFeErrorCode(BE_ERRORS.ALBUM404.payload.code)).toBe('NOT_FOUND')
    // 14의 force 재시도 분기 근거(CHMO-324·265) — 2026-07-22 실서버 채집
    expect(toFeErrorCode(BE_ERRORS.PUBLISH409.payload.code)).toBe('HAS_UNREVIEWED_PHOTOS')
  })

  it('소셜 로그인 실패는 셋을 구분한다 — 다른 방법 안내·재시도·잠시 후 재시도 (CHMO-359)', () => {
    expect(toFeErrorCode('OAUTH400')).toBe('UNSUPPORTED_SOCIAL_PROVIDER')
    expect(toFeErrorCode('OAUTH401')).toBe('SOCIAL_AUTH_FAILED')
    expect(toFeErrorCode('OAUTH502')).toBe('SOCIAL_PROVIDER_ERROR')
  })

  it('매핑에 없는 코드는 그대로 통과시킨다 — 화면은 status로 분기하고 BE message는 이미 한국어다', () => {
    expect(toFeErrorCode(BE_ERRORS.VALID400.payload.code)).toBe('VALID400')
    expect(toFeErrorCode(BE_ERRORS.PHOTO400.payload.code)).toBe('PHOTO400')
    expect(toFeErrorCode(BE_ERRORS.PHOTO404.payload.code)).toBe('PHOTO404')
    expect(toFeErrorCode(BE_ERRORS.TOKEN401.payload.code)).toBe('TOKEN401')
  })
})
