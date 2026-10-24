import { describe, expect, it } from 'vitest'
import stagingAppConfig from '../../test/fixtures/app-config-staging.json'
import {
  attendanceDisplay,
  attendancePayloadError,
  buildChanges,
  changedFields,
  durationDays,
  fieldError,
  fields,
  toDraft,
  hasQuestSettings,
  hasSubscriptionSettings,
  missingHistoryPolicies,
  restorePreview,
  restoreCompatibilityError,
  settingsEnvironmentLabel,
  settingsErrors,
} from './operationSettings'
import type { OperationValues } from '../api/operationSettings'

// API 응답 픽스처가 아닌 폼 규칙 테스트 입력. MSW·운영 기본값과 독립적이다.
const values: OperationValues = {
  app: { minVersion: { ios: '3.0.0', android: '4.0.0' } },
  credit: {
    signupGrant: 42,
    migrationGrant: 40000,
    dailyGrant: 10,
    cap: 500,
    enforcementStartsAt: '2026-01-01T15:00:00Z',
    migrationCutoffAt: '2025-01-01T00:00:00Z',
  },
  institution: { trialPeriod: 'PT336H', gracePeriod: 'P7D' },
  attendancePush: {
    enabled: false,
    sendTime: '19:00',
    copy: {
      ko: { title: '제목', body: '본문' },
      en: { title: 'Title', body: 'Body' },
      ja: { title: '出席', body: '本文' },
    },
  },
}
const withQuest: OperationValues = {
  ...values,
  quest: { enabled: true, createGroupReward: 45, uploadPhotoReward: 120, inviteFriendReward: 300 },
  institutionSubscription: { offerEnabled: true, purchaseEnabled: true },
}
const validate = (path: string, value: string) =>
  fieldError(
    fields.find((f) => f.path === path)!,
    value,
  )
describe('운영 설정 변경 폼 — BE CHMO-958 소스 규칙 대조', () => {
  it('공개 실응답의 버전·스토어 형식을 읽고 한 플랫폼만 변경 요청에 담는다', () => {
    // 공개 GET만 실측했다. 관리자 저장 결과와 공개 설정의 일치는 dev 로그인 후 별도 검증한다.
    const current = { ...values, app: stagingAppConfig }
    const draft = toDraft(current)
    expect(draft['app.minVersion.ios']).toBe(stagingAppConfig.minVersion.ios)
    expect(draft['app.storeUrl.android']).toBe(stagingAppConfig.storeUrl.android)
    for (const field of fields.filter((f) => f.path.startsWith('app.')))
      expect(fieldError(field, draft[field.path])).toBeNull()
    expect(buildChanges(current, { ...draft, 'app.minVersion.ios': '2.5.1' }, 'app')).toEqual({
      app: { minVersion: { ios: '2.5.1' } },
    })
  })
  it('한 플랫폼만 변경하면 다른 플랫폼·URL을 요청에 넣지 않는다', () => {
    const draft = { ...toDraft(values), 'app.minVersion.ios': '3.1.0' }
    expect(buildChanges(values, draft, 'app')).toEqual({ app: { minVersion: { ios: '3.1.0' } } })
  })
  it('URL 삭제는 null, 미수정 누락 URL은 변경하지 않는다', () => {
    const before = {
      ...values,
      app: { ...values.app, storeUrl: { ios: 'https://apps.apple.com/app/id123' } },
    }
    expect(buildChanges(before, { ...toDraft(before), 'app.storeUrl.ios': '' }, 'app')).toEqual({
      app: { storeUrl: { ios: null } },
    })
    expect(buildChanges(values, toDraft(values), 'app')).toEqual({})
  })
  it('이관된 범위 밖 값은 다른 필드 수정 시 요청에 재전송하지 않는다', () => {
    const draft = { ...toDraft(values), 'credit.signupGrant': '100' }
    expect(changedFields(values, draft, 'credit').map((f) => f.path)).toEqual([
      'credit.signupGrant',
    ])
    expect(buildChanges(values, draft, 'credit')).toEqual({ credit: { signupGrant: 100 } })
  })
  it('기간 문자열 PT336H를 14일로 표시하고 실제 변경만 ISO 기간으로 보낸다', () => {
    expect(durationDays('PT336H')).toBe('14')
    expect(durationDays('P7D')).toBe('7')
    expect(durationDays('PT0S')).toBe('0')
    expect(
      buildChanges(values, { ...toDraft(values), 'institution.trialPeriod': '0' }, 'institution'),
    ).toEqual({ institution: { trialPeriod: 'P0D' } })
  })
  it('KST 날짜를 UTC로 변환하고 비활성화는 null을 보낸다. 고정 기준일은 보내지 않는다', () => {
    expect(toDraft(values)['credit.enforcementStartsAt']).toBe('2026-01-02T00:00:00')
    expect(
      buildChanges(
        values,
        { ...toDraft(values), 'credit.enforcementStartsAt': '2026-02-01T00:00' },
        'credit',
      ),
    ).toEqual({ credit: { enforcementStartsAt: '2026-01-31T15:00:00.000Z' } })
    expect(
      buildChanges(values, { ...toDraft(values), 'credit.enforcementStartsAt': '' }, 'credit'),
    ).toEqual({ credit: { enforcementStartsAt: null } })
  })
  it.each(['', '1.2', '01.2.3', '1.2.3+1', '1.2.3-beta', '1.2.3\n'])(
    '잘못된 버전 %j를 거절한다',
    (value) => expect(validate('app.minVersion.ios', value)).not.toBeNull(),
  )
  it('올바른 숫자 세 마디·장수·기관 기간 경계를 받는다', () => {
    expect(validate('app.minVersion.ios', '0.10.200')).toBeNull()
    for (const value of ['0', '10000']) expect(validate('credit.signupGrant', value)).toBeNull()
    for (const value of ['', '-1', '1.5', '10001'])
      expect(validate('credit.signupGrant', value)).not.toBeNull()
    expect(validate('institution.trialPeriod', '365')).toBeNull()
    expect(validate('institution.trialPeriod', '366')).not.toBeNull()
  })
  it('공식 스토어 HTTPS·443·경로만 허용하며 사용자 정보·fragment·잘못된 플랫폼을 거절한다', () => {
    expect(validate('app.storeUrl.ios', 'https://apps.apple.com:443/app/id123')).toBeNull()
    expect(validate('app.storeUrl.ios', '')).toBeNull()
    for (const value of [
      'https://play.google.com/app',
      'https://apps.apple.com',
      'https://user@apps.apple.com/app',
      'http://apps.apple.com/app',
      'https://apps.apple.com:444/app',
      'https://apps.apple.com/app#',
      'https://apps.apple.com/app#top',
      'https://apps.apple.com/a b',
    ])
      expect(validate('app.storeUrl.ios', value)).not.toBeNull()
  })
  it('출석 시간은 08:00~20:59이며 세 언어 본문이 필요하다', () => {
    for (const value of ['08:00', '20:59'])
      expect(validate('attendancePush.sendTime', value)).toBeNull()
    for (const value of ['07:59', '21:00', '19:60', ''])
      expect(validate('attendancePush.sendTime', value)).not.toBeNull()
    expect(validate('attendancePush.copy.ja.body', ' ')).not.toBeNull()
  })
  it('언어별 자동 광고 문구를 중복 없이 표시하고 UTF-8 최종 payload 상한을 검증한다', () => {
    expect(attendanceDisplay('en', 'Title', 'Body').title).toBe('(Ad) Title')
    expect(attendanceDisplay('ja', '(広告) 出席', '本文').title).toBe('(広告) 出席')
    expect(attendancePayloadError(toDraft(values))).toBeNull()
    expect(
      attendancePayloadError({
        ...toDraft(values),
        'attendancePush.copy.ko.body': '가'.repeat(600),
      }),
    ).toContain('ko')
  })
})

describe('퀘스트 운영 설정 — CHMO-973 QuestPolicy 및 CHMO-978', () => {
  it('서버의 현재 보상을 표시하며 OFF만 변경하면 보상·다른 설정은 전송하지 않는다', () => {
    const draft = toDraft(withQuest)
    expect(draft['quest.createGroupReward']).toBe('45')
    expect(draft['quest.uploadPhotoReward']).toBe('120')
    expect(buildChanges(withQuest, { ...draft, 'quest.enabled': 'false' }, 'quest')).toEqual({
      quest: { enabled: false },
    })
    expect(buildChanges(withQuest, { ...draft, 'credit.signupGrant': '77' }, 'credit')).toEqual({
      credit: { signupGrant: 77 },
    })
  })
  it('구 서버 응답의 누락을 기본 보상·OFF로 바꾸거나 PATCH하지 않는다', () => {
    expect(hasQuestSettings(values)).toBe(false)
    expect(toDraft(values)['quest.enabled']).toBe('')
    expect(toDraft(values)['quest.createGroupReward']).toBe('')
    expect(buildChanges(values, { ...toDraft(values), 'quest.enabled': 'true' }, 'quest')).toEqual(
      {},
    )
  })
  it.each(['0', '-1', '1.5', '1e2', '', '10001', 'NaN'])(
    '보상 %j는 양의 정수·상한 검증에서 거절한다',
    (value) => {
      expect(
        settingsErrors(
          withQuest,
          { ...toDraft(withQuest), 'quest.createGroupReward': value },
          'quest',
        ),
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'quest.createGroupReward' })]),
      )
    },
  )
  it.each([
    ['quest.createGroupReward', '300'],
    ['quest.uploadPhotoReward', '301'],
    ['quest.inviteFriendReward', '120'],
  ])('수정한 %s와 기존 보상도 함께 비교한다', (path, value) => {
    const errors = settingsErrors(withQuest, { ...toDraft(withQuest), [path]: value }, 'quest')
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('quest.inviteFriendReward')
  })
  it('유효한 상한·하한을 받으며 숫자 타입으로 수정한 보상만 보낸다', () => {
    const draft = {
      ...toDraft(withQuest),
      'quest.createGroupReward': '1',
      'quest.inviteFriendReward': '10000',
    }
    expect(settingsErrors(withQuest, draft, 'quest')).toEqual([])
    expect(buildChanges(withQuest, draft, 'quest')).toEqual({
      quest: { createGroupReward: 1, inviteFriendReward: 10000 },
    })
  })
  it('수정하지 않은 퀘스트는 다른 설정 저장을 방해하지 않는다', () => {
    expect(
      settingsErrors(values, { ...toDraft(values), 'app.minVersion.ios': '3.1.0' }, 'app'),
    ).toEqual([])
  })
  it('옛 이력의 누락·null 정책은 현재 값을 유지하고 명시된 정책만 복원한다', () => {
    expect(restoreCompatibilityError(withQuest, values)).toBeNull()
    expect(restoreCompatibilityError(values, withQuest)).toContain('퀘스트')
    expect(restorePreview(withQuest, values).quest).toEqual(withQuest.quest)
    expect(
      restorePreview(withQuest, { ...values, quest: null, institutionSubscription: null }),
    ).toMatchObject({
      quest: withQuest.quest,
      institutionSubscription: withQuest.institutionSubscription,
    })
    expect(missingHistoryPolicies(values)).toEqual(['퀘스트·보상', '기관 월 구독'])
    const legacyResolved = {
      ...values,
      quest: {
        enabled: false,
        createGroupReward: 30,
        uploadPhotoReward: 100,
        inviteFriendReward: 200,
      },
    }
    expect(restoreCompatibilityError(withQuest, legacyResolved)).toBeNull()
    expect(toDraft(legacyResolved)['quest.enabled']).toBe('false')
    expect(toDraft(legacyResolved)['quest.createGroupReward']).toBe('30')
    expect(restoreCompatibilityError(values, values)).toBeNull()
  })
  it('옛 서버에서는 퀘스트가 없는 이력의 복원을 허용하지 않는다', () => {
    expect(
      restoreCompatibilityError({ ...withQuest, institutionSubscription: undefined }, values),
    ).toContain('퀘스트')
  })
  it('복원 미리보기에서 고정 가입자 기준일을 유지하고 일일 지급·상한 변경은 막는다', () => {
    const old = { ...values, credit: { ...values.credit, migrationCutoffAt: null, cap: 100 } }
    expect(restorePreview(withQuest, old).credit.migrationCutoffAt).toBe(
      values.credit.migrationCutoffAt,
    )
    expect(restoreCompatibilityError(withQuest, old)).toContain('출석 상한')
  })
})

describe('기관 월 구독 운영 설정 — CHMO-978', () => {
  it('구매만 중단할 때 안내·퀘스트·기관 체험을 변경하지 않는다', () => {
    const draft = { ...toDraft(withQuest), 'institutionSubscription.purchaseEnabled': 'false' }
    expect(settingsErrors(withQuest, draft, 'institutionSubscription')).toEqual([])
    expect(buildChanges(withQuest, draft, 'institutionSubscription')).toEqual({
      institutionSubscription: { purchaseEnabled: false },
    })
  })
  it('안내 OFF·구매 ON은 현재 값과 합쳐 검증하며 두 값을 함께 끌 수 있다', () => {
    const draft: Record<string, string> = {
      ...toDraft(withQuest),
      'institutionSubscription.offerEnabled': 'false',
    }
    expect(settingsErrors(withQuest, draft, 'institutionSubscription')).toEqual([
      expect.objectContaining({ path: 'institutionSubscription.purchaseEnabled' }),
    ])
    draft['institutionSubscription.purchaseEnabled'] = 'false'
    expect(settingsErrors(withQuest, draft, 'institutionSubscription')).toEqual([])
    expect(buildChanges(withQuest, draft, 'institutionSubscription')).toEqual({
      institutionSubscription: { offerEnabled: false, purchaseEnabled: false },
    })
  })
  it('구 서버의 누락·불완전한 응답을 OFF로 합성하거나 전송하지 않는다', () => {
    expect(hasSubscriptionSettings(values)).toBe(false)
    expect(toDraft(values)['institutionSubscription.offerEnabled']).toBe('')
    expect(
      buildChanges(
        values,
        { ...toDraft(values), 'institutionSubscription.offerEnabled': 'true' },
        'institutionSubscription',
      ),
    ).toEqual({})
    const invalid = {
      ...withQuest,
      institutionSubscription: { offerEnabled: true },
    } as OperationValues
    expect(hasSubscriptionSettings(invalid)).toBe(false)
    expect(restoreCompatibilityError(withQuest, invalid)).toContain('월 구독')
  })
})

describe('운영 설정 대상 환경', () => {
  it('목·운영·개발 대상을 구분하고 모르는 호스트를 운영이라고 단정하지 않는다', () => {
    expect(settingsEnvironmentLabel(undefined, true)).toContain('로컬 목')
    expect(settingsEnvironmentLabel(undefined, false)).toContain('운영 서버')
    expect(settingsEnvironmentLabel('https://api.cheese-moa.com', false)).toContain('운영 서버')
    expect(settingsEnvironmentLabel('https://dev.example.com', false)).toBe(
      '연결 서버 · dev.example.com',
    )
    expect(settingsEnvironmentLabel('http://localhost:8080', false)).toBe(
      '연결 서버 · localhost:8080',
    )
  })
})

describe('차감 시작 시각 달력 검증', () => {
  it.each(['2026-02-29T12:00', '2026-02-31T12:00', '2026-04-31T00:00', '2026-01-01T24:00'])(
    '존재하지 않는 날짜·시간 %s는 자동 보정하지 않는다',
    (value) => {
      expect(validate('credit.enforcementStartsAt', value)).not.toBeNull()
    },
  )
  it('윤년·초 단위·비활성화를 허용한다', () => {
    for (const value of ['2028-02-29T12:00', '2026-01-01T12:30:45', ''])
      expect(validate('credit.enforcementStartsAt', value)).toBeNull()
  })
})
