import { beforeEach, describe, expect, it } from 'vitest'
import staging from '../../test/fixtures/operation-settings-staging.json'
import { setAuthTokens } from '../../lib/auth'
import { bodyOf, jsonResponse, stubFetch } from '../../test/http'
import {
  changeOperationSettings,
  getAttendanceSettings,
  getOperationSettings,
  getSettingsHistory,
  restoreSettings,
  updateAttendanceSettings,
} from './operationSettings'
import {
  buildChanges,
  missingHistoryPolicies,
  restoreCompatibilityError,
  restorePreview,
  toDraft,
} from '../lib/operationSettings'

// 2026-10-24 staging 실응답. 출처·비식별화 범위는 fixture.source와 admin-spec에 기록한다.
// 이 테스트의 fetch 재생은 권한 회수·만료·서버 쓰기 잠금의 실서버 검증을 대체하지 않는다.
beforeEach(() => setAuthTokens({ accessToken: 'test-at', refreshToken: 'test-rt' }))

describe('CHMO-959 staging 운영 설정 실응답 계약', () => {
  it('현재 응답에서 퀘스트·구독·기간·공개 앱 설정을 그대로 읽는다', async () => {
    stubFetch(() => jsonResponse(staging.current.body, staging.current.status))
    const current = await getOperationSettings()
    expect(current).toEqual(staging.current.body.result)
    expect(current.settings.quest).toEqual({
      enabled: true,
      createGroupReward: 30,
      uploadPhotoReward: 100,
      inviteFriendReward: 200,
    })
    expect(current.settings.institutionSubscription).toEqual({
      offerEnabled: false,
      purchaseEnabled: false,
    })
    expect(toDraft(current.settings)['institution.trialPeriod']).toBe('14')
    expect(toDraft(current.settings)['app.minVersion.ios']).toBe('2.5.0')
  })

  it('실제 URL 변경 이력으로 요청을 만들 때 다른 설정을 전송하지 않는다', async () => {
    stubFetch(() => jsonResponse(staging.history.body, staging.history.status))
    const history = await getSettingsHistory()
    const changed = history.items.find((item) => item.revision === 4)!
    expect(buildChanges(changed.before, toDraft(changed.after), 'app')).toEqual({
      app: { storeUrl: { ios: 'https://apps.apple.com/app/id6797158719?chmo959=dev-check' } },
    })
    const restored = history.items.find((item) => item.revision === 8)!
    expect(restored.restoredFrom).toBe(7)
    expect(restored.after).toEqual(changed.before)
    expect(staging.current.body.result.settings).toEqual(changed.before)
  })

  it('누락 정책이 있는 실제 옛 이력의 복원 미리보기가 서버 복원 결과와 일치한다', async () => {
    const calls = stubFetch((call) =>
      call.method === 'POST'
        ? jsonResponse(staging.legacyRestore.body, staging.legacyRestore.status)
        : jsonResponse(staging.history.body, staging.history.status),
    )
    const history = await getSettingsHistory()
    const legacy = history.items.find((item) => item.revision === 2)!
    const restored = history.items.find((item) => item.revision === 6)!
    expect(missingHistoryPolicies(legacy.after)).toEqual(['퀘스트·보상', '기관 월 구독'])
    expect(restoreCompatibilityError(restored.before, legacy.after)).toBeNull()
    const response = await restoreSettings(legacy.historyId, 5, '옛 이력 복원 검증', 'AFTER')
    expect(bodyOf(calls[1])).toEqual({
      expectedRevision: 5,
      reason: '옛 이력 복원 검증',
      snapshot: 'AFTER',
    })
    expect(restorePreview(restored.before, legacy.after)).toEqual(response.settings)
    expect(response.settings.quest?.enabled).toBe(true)
  })

  it('실제 result 없는 SETTINGS409를 거절하고 쓰기를 재시도하지 않는다', async () => {
    const calls = stubFetch(() => jsonResponse(staging.conflict.body, staging.conflict.status))
    await expect(
      changeOperationSettings(3, '오래된 revision 검증', {
        app: { storeUrl: { android: 'https://play.google.com/store/apps/details?id=test' } },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'SETTINGS409' })
    expect(calls).toHaveLength(1)
  })

  it('실제 출석 ETag를 If-Match로 보내고 응답·이력에서 다른 정책 보존을 확인한다', async () => {
    const calls = stubFetch((call) => {
      const response = call.method === 'PUT' ? staging.attendanceUpdate : staging.attendanceBefore
      return jsonResponse(response.body, response.status, { ETag: response.etag })
    })
    const current = await getAttendanceSettings()
    const updated = await updateAttendanceSettings(
      staging.attendanceUpdate.body.result,
      current.etag,
      '출석 문구 검증',
    )
    expect(calls[1].headers.get('If-Match')).toBe('"6"')
    expect(calls[1].headers.get('X-Change-Reason')).toBe(encodeURIComponent('출석 문구 검증'))
    expect(updated.enabled).toBe(false)
    const changed = staging.history.body.result.items.find((item) => item.revision === 7)!
    expect(changed.after).toEqual({ ...changed.before, attendancePush: updated })
    expect(changed.after.quest).toEqual(changed.before.quest)
    expect(changed.after.institutionSubscription).toEqual(changed.before.institutionSubscription)
  })
})
