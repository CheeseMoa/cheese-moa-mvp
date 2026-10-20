import stagingAttendance from '../../test/fixtures/attendance-settings-staging.json'
/** 요청 직렬화·인증 인프라 검사. MSW 응답을 계약 증거로 사용하지 않는다. 실 BE 연동은 배포 후 별도. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  changeOperationSettings,
  saveAndReloadSettings,
  getAttendanceSettings,
  getAttendanceStatistics,
  getSettingsHistory,
  restoreSettings,
  updateAttendanceSettings,
} from './operationSettings'
import { setAuthTokens } from '../../lib/auth'
import { bodyOf, jsonResponse, stubFetch } from '../../test/http'
import { envelope } from '../../test/fixtures/be'

beforeEach(() => setAuthTokens({ accessToken: 'test-at', refreshToken: 'test-rt' }))
describe('운영 설정 요청·공용 응답 헤더', () => {
  it('부분 변경과 현재 revision·사유를 보낸다', async () => {
    const calls = stubFetch(() => jsonResponse(envelope({})))
    await changeOperationSettings(42, '스토어 공개 확인', { app: { minVersion: { ios: '3.1.0' } } })
    expect(calls[0].url).toBe('/api/v1/admin/operation-settings')
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer test-at')
    expect(bodyOf(calls[0])).toEqual({
      expectedRevision: 42,
      reason: '스토어 공개 확인',
      changes: { app: { minVersion: { ios: '3.1.0' } } },
    })
  })
  it('출석 GET에서 ETag를 읽고 한글 사유를 percent 인코딩해 기존 PUT을 사용한다', async () => {
    const calls = stubFetch(() =>
      jsonResponse(envelope({ enabled: false, sendTime: '19:00', copy: {} }), 200, {
        ETag: '"12"',
      }),
    )
    const current = await getAttendanceSettings()
    await updateAttendanceSettings(current.settings, current.etag, '출석 시간 변경')
    expect(calls[1].url).toBe('/api/v1/admin/notifications/daily-attendance/settings')
    expect(calls[1].method).toBe('PUT')
    expect(calls[1].headers.get('If-Match')).toBe('"12"')
    expect(calls[1].headers.get('X-Change-Reason')).toBe(encodeURIComponent('출석 시간 변경'))
  })
  it('ETag가 누락되면 쓰기에 사용할 설정을 반환하지 않는다', async () => {
    stubFetch(() => jsonResponse(envelope({})))
    await expect(getAttendanceSettings()).rejects.toMatchObject({
      status: 200,
      code: 'INVALID_SETTINGS_RESPONSE',
    })
  })
  it('401 인증 갱신 뒤 최종 응답의 ETag를 반환한다', async () => {
    let count = 0
    stubFetch((call) => {
      if (call.url.endsWith('/auth/refresh'))
        return jsonResponse(envelope({ accessToken: 'new-at', refreshToken: 'new-rt' }))
      return count++ === 0
        ? jsonResponse({ isSuccess: false, code: 'COMMON401', message: '만료', result: null }, 401)
        : jsonResponse(envelope({}), 200, { ETag: '"99"' })
    })
    expect((await getAttendanceSettings()).etag).toBe('"99"')
  })
  it.each([
    [409, 'SETTINGS409'],
    [503, 'SETTINGS503'],
    [403, 'ADMIN403'],
  ])('실패 %i를 성공으로 소비하지 않는다', async (status, code) => {
    stubFetch(() => jsonResponse({ isSuccess: false, code, message: '실패', result: null }, status))
    await expect(
      changeOperationSettings(1, '검증', { credit: { signupGrant: 10 } }),
    ).rejects.toMatchObject({ status })
  })
  it('이력 커서·복원 스냅샷·통계 날짜를 각각 해당 API로 전달한다', async () => {
    const calls = stubFetch(() => jsonResponse(envelope({})))
    await getSettingsHistory(5)
    await restoreSettings(3, 17, '이전 값 복원', 'BEFORE')
    await getAttendanceStatistics('2026-10-19')
    expect(calls[0].url).toBe('/api/v1/admin/operation-settings/history?size=20&cursor=5')
    expect(calls[1].url).toBe('/api/v1/admin/operation-settings/history/3/restore')
    expect(bodyOf(calls[1])).toEqual({
      expectedRevision: 17,
      reason: '이전 값 복원',
      snapshot: 'BEFORE',
    })
    expect(calls[2].url).toBe(
      '/api/v1/admin/notifications/daily-attendance/statistics?date=2026-10-19',
    )
  })
})

describe('저장 성공과 후속 재조회 실패 구분', () => {
  it('저장 뒤 재조회 401을 숨기지 않고 세션 처리에 전달한다', async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        { isSuccess: false, code: 'COMMON401', message: '세션 만료', result: null },
        401,
      ),
    )
    setAuthTokens({ accessToken: 'test-at', refreshToken: '' })
    const write = vi.fn(async () => undefined)
    const outcome = await saveAndReloadSettings(write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(outcome.value).toBeNull()
    expect(outcome.refreshError).toMatchObject({ status: 401 })
    expect(calls).toHaveLength(1)
  })
  it('저장 후 네트워크 실패도 저장 요청을 반복하지 않는다', async () => {
    stubFetch(() => {
      throw new TypeError('offline')
    })
    const write = vi.fn(async () => undefined)
    expect((await saveAndReloadSettings(write)).value).toBeNull()
    expect(write).toHaveBeenCalledTimes(1)
  })
  it('저장 자체가 충돌하면 성공·재조회로 이어지지 않는다', async () => {
    const read = vi.fn(() => jsonResponse(envelope({})))
    stubFetch(read)
    const conflict = new Error('revision conflict')
    await expect(
      saveAndReloadSettings(async () => {
        throw conflict
      }),
    ).rejects.toBe(conflict)
    expect(read).not.toHaveBeenCalled()
  })
})

// 2026-10-19 Chrome Network에서 채집. 본문 200, ETag W/"0",
// Access-Control-Expose-Headers: X-Request-Id, ETag. 인증정보는 보관하지 않는다.
describe('스테이징 실응답 ETag 회귀', () => {
  it('W/"0" 응답을 읽고 BE가 요구하는 If-Match "0"을 전송한다', async () => {
    const calls = stubFetch(() => jsonResponse(stagingAttendance, 200, { ETag: 'W/"0"' }))
    const current = await getAttendanceSettings()
    expect(current.settings).toEqual(stagingAttendance.result)
    expect(current.etag).toBe('"0"')
    await updateAttendanceSettings(current.settings, current.etag, '응답 헤더 회귀 테스트')
    expect(calls[1].headers.get('If-Match')).toBe('"0"')
  })
  it.each(['W/"12"', '"12"'])('숫자 revision %s만 정규화한다', async (etag) => {
    stubFetch(() => jsonResponse(stagingAttendance, 200, { ETag: etag }))
    expect((await getAttendanceSettings()).etag).toBe('"12"')
  })
  it.each(['W/"abc"', '0', '"0", "1"', 'w/"0"'])(
    '유효하지 않은 태그 %s를 네트워크 오류로 분류하지 않는다',
    async (etag) => {
      stubFetch(() => jsonResponse(stagingAttendance, 200, { ETag: etag }))
      await expect(getAttendanceSettings()).rejects.toMatchObject({
        status: 200,
        code: 'INVALID_SETTINGS_RESPONSE',
      })
    },
  )
})
