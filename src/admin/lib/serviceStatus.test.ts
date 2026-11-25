import { describe, expect, it } from 'vitest'
import staging from '../../test/fixtures/operation-settings-staging.json'
import publicConfig from '../../test/fixtures/app-config-service-staging.json'
import type { OperationValues, SettingsHistory } from '../api/operationSettings'
import {
  buildChanges,
  changedFields,
  fieldError,
  fields,
  hasServiceSettings,
  missingHistoryPolicies,
  restoreCompatibilityError,
  restorePreview,
  settingDisplay,
  settingsErrors,
  toDraft,
} from './operationSettings'
import {
  isPausedMode,
  latestModeChange,
  noticeDisplay,
  noticeLength,
  noticeOf,
  noticeSource,
  SERVICE_PAUSE_COPY,
} from './serviceStatus'

// 폼 규칙 테스트 입력. BE CHMO-993(PR #376 · ServiceSettings·SettingsPolicy·통합 테스트)과 대조한 관리자
// 응답 모양이며 실서버 응답이 아니다(관리자 실응답은 dev 관리자 로그인 뒤 채집 — 후속).
const base: OperationValues = {
  app: { minVersion: { ios: '3.0.0', android: '4.0.0' } },
  credit: {
    signupGrant: 50,
    migrationGrant: 500,
    dailyGrant: 10,
    cap: 500,
    enforcementStartsAt: null,
    migrationCutoffAt: null,
  },
  institution: { trialPeriod: 'PT336H', gracePeriod: 'PT168H' },
  attendancePush: {
    enabled: false,
    sendTime: '19:00',
    copy: {
      ko: { title: '제목', body: '본문' },
      en: { title: 'Title', body: 'Body' },
      ja: { title: '出席', body: '本文' },
    },
  },
  quest: { enabled: true, createGroupReward: 30, uploadPhotoReward: 100, inviteFriendReward: 200 },
  institutionSubscription: { offerEnabled: false, purchaseEnabled: false },
}
const emptyNotice = {
  ko: { title: null, body: null },
  en: { title: null, body: null },
  ja: { title: null, body: null },
}
// ServiceSettings.defaults(): 세 언어 키를 항상 싣고, 바뀐 적 없으면 updatedAt null
const normal: OperationValues = {
  ...base,
  service: { mode: 'NORMAL', notice: emptyNotice, updatedAt: null },
}
const paused: OperationValues = {
  ...base,
  service: {
    mode: 'READ_ONLY',
    notice: { ...emptyNotice, ko: { title: '잠시 쉬어요', body: null } },
    updatedAt: '2026-11-17T05:40:00Z',
  },
}
const field = (path: string) => fields.find((f) => f.path === path)!
const historyItem = (
  historyId: number,
  before: OperationValues,
  after: OperationValues,
): SettingsHistory => ({
  historyId,
  revision: historyId,
  actorUserId: 9,
  changedAt: '2026-11-17T05:40:00Z',
  reason: `사유 ${historyId}`,
  before,
  after,
  scope: 'GLOBAL',
  restoredFrom: null,
})

describe('서비스 상태 안내 문구 — 변경 요청 (CHMO-994 AC-2)', () => {
  it('기본값(세 언어 null)은 빈 칸으로 읽고, 바꾼 언어·필드만 보낸다', () => {
    const draft = toDraft(normal)
    expect(draft['service.mode']).toBe('NORMAL')
    expect(draft['service.notice.ko.title']).toBe('')
    // notice 자체가 null인 값도 같은 빈 칸으로 읽는다(이력·구 응답 방어)
    expect(toDraft({ ...base, service: { mode: 'NORMAL', notice: null } })).toMatchObject({
      'service.notice.ja.body': '',
    })
    expect(
      buildChanges(normal, { ...draft, 'service.notice.en.body': 'Paused\nfor now' }, 'service'),
    ).toEqual({ service: { notice: { en: { body: 'Paused\nfor now' } } } })
  })

  it('서버처럼 앞뒤 공백을 걷어 보내고, 공백만 다른 값은 변경으로 세지 않는다', () => {
    const draft = toDraft(paused)
    expect(
      buildChanges(paused, { ...draft, 'service.notice.en.title': '  Back soon \n' }, 'service'),
    ).toEqual({ service: { notice: { en: { title: 'Back soon' } } } })
    expect(
      changedFields(paused, { ...draft, 'service.notice.ko.title': ' 잠시 쉬어요  ' }, 'service'),
    ).toEqual([])
    expect(settingDisplay(field('service.notice.ko.title'), '  안내  ')).toBe('안내')
  })

  it('지운 칸은 null(앱 기본 문구)로 보낸다', () => {
    const draft = toDraft(paused)
    expect(draft['service.notice.ko.title']).toBe('잠시 쉬어요')
    expect(buildChanges(paused, { ...draft, 'service.notice.ko.title': '' }, 'service')).toEqual({
      service: { notice: { ko: { title: null } } },
    })
  })

  it('문구 저장은 모드를 보내지 않는다 — 모드는 전환 확인창으로만 바꾼다', () => {
    const changes = buildChanges(
      normal,
      { ...toDraft(normal), 'service.notice.ja.title': 'お知らせ' },
      'service',
    )
    expect(changes).toEqual({ service: { notice: { ja: { title: 'お知らせ' } } } })
  })

  it('제목 40자·본문 300자 상한은 공백을 걷어낸 코드 포인트로 센다(이모지 1자)', () => {
    expect(fieldError(field('service.notice.ko.title'), '😀'.repeat(40))).toBeNull()
    expect(fieldError(field('service.notice.ko.title'), '😀'.repeat(41))).toContain('40자')
    expect(fieldError(field('service.notice.ko.title'), `  ${'가'.repeat(40)}\n`)).toBeNull()
  })

  it('제목 40자·본문 300자 상한과 공백만 있는 값을 막고, 빈 값은 허용한다', () => {
    expect(fieldError(field('service.notice.ko.title'), '가'.repeat(40))).toBeNull()
    expect(fieldError(field('service.notice.ko.title'), '가'.repeat(41))).toContain('40자')
    expect(fieldError(field('service.notice.ja.body'), 'あ'.repeat(300))).toBeNull()
    expect(fieldError(field('service.notice.ja.body'), 'あ'.repeat(301))).toContain('300자')
    expect(fieldError(field('service.notice.en.title'), '   ')).toContain('공백')
    expect(fieldError(field('service.notice.en.title'), '')).toBeNull()
    expect(
      settingsErrors(
        normal,
        { ...toDraft(normal), 'service.notice.en.body': 'x'.repeat(301) },
        'service',
      ),
    ).toEqual([expect.objectContaining({ path: 'service.notice.en.body', label: 'en 안내 본문' })])
  })

  it('전후 값 표시는 모드를 한국어로, 빈 문구를 앱 기본 문구로 읽는다', () => {
    expect(settingDisplay(field('service.mode'), 'READ_ONLY')).toBe('읽기 전용')
    expect(settingDisplay(field('service.mode'), 'NORMAL')).toBe('평소 운영')
    expect(settingDisplay(field('service.notice.ko.body'), '')).toBe('앱 기본 문구')
    expect(settingDisplay(field('service.notice.ko.body'), '안내')).toBe('안내')
  })
})

describe('서비스 상태가 없는 서버·이력 (BE CHMO-993 배포 전)', () => {
  it('2026-10-24 staging 실응답에는 service가 없어 편집을 잠그고 변경을 만들지 않는다', () => {
    const current = staging.current.body.result.settings as OperationValues
    expect(current.service).toBeUndefined()
    expect(hasServiceSettings(current)).toBe(false)
    expect(
      changedFields(current, { ...toDraft(current), 'service.notice.ko.title': '안내' }, 'service'),
    ).toEqual([])
  })

  it('실제 staging 이력은 전부 서비스 상태 기록이 없고, 전환 기록으로 오인하지 않는다', () => {
    const items = staging.history.body.result.items as unknown as SettingsHistory[]
    for (const item of items) expect(missingHistoryPolicies(item.after)).toContain('서비스 상태')
    expect(latestModeChange(items)).toBeNull()
  })

  it('서비스 상태가 없는 옛 이력을 복원해도 현재 상태를 유지한다', () => {
    const legacy = { ...base, quest: base.quest, institutionSubscription: undefined }
    expect(restorePreview(paused, legacy).service).toEqual(paused.service)
    expect(restoreCompatibilityError(paused, legacy)).toBeNull()
  })

  it('현재 서버가 서비스 상태를 주지 않으면 그 값을 담은 이력의 전체 복원을 막는다', () => {
    expect(restoreCompatibilityError(base, paused)).toContain('서비스 상태')
  })
})

describe('dev 공개 설정 실응답 (2026-11-17 · BE CHMO-993 배포 직후)', () => {
  it('평소 운영은 service.mode만 싣고 기존 최상위 필드를 그대로 둔다', () => {
    const body = publicConfig.normal.body
    expect(Object.keys(body.service)).toEqual(['mode'])
    expect(isPausedMode(body.service.mode)).toBe(false)
    expect(Object.keys(body)).toEqual(['minVersion', 'storeUrl', 'service'])
  })
})

describe('서비스 상태 판정', () => {
  it('NORMAL 밖의 값은 모르는 모드라도 멈춘 것으로 본다(앱 해석과 같다)', () => {
    expect(isPausedMode('READ_ONLY')).toBe(true)
    expect(isPausedMode('MAINTENANCE')).toBe(true)
    expect(isPausedMode('NORMAL')).toBe(false)
    expect(isPausedMode(null)).toBe(false)
    expect(isPausedMode(undefined)).toBe(false)
  })

  it('가장 최근 모드 전환을 찾고, 문구만 바꾼 이력은 건너뛴다', () => {
    const noticeOnly = historyItem(3, paused, {
      ...paused,
      service: { mode: 'READ_ONLY', notice: { ko: { title: '곧 돌아와요' } } },
    })
    const toReadOnly = historyItem(2, normal, paused)
    const legacy = historyItem(1, base, base)
    expect(latestModeChange([noticeOnly, toReadOnly, legacy])).toBe(toReadOnly)
    expect(latestModeChange([noticeOnly, legacy])).toBeNull()
  })

  it('비운 언어·필드는 앱 기본 문구로 보여 주고 출처를 구분한다', () => {
    expect(noticeLength(' 😀가 ')).toBe(2)
    const ko = noticeOf(paused.service, 'ko')
    expect(ko).toEqual({ title: '잠시 쉬어요', body: '' })
    expect(noticeDisplay('ko', ko.title, ko.body)).toEqual({
      title: '잠시 쉬어요',
      body: SERVICE_PAUSE_COPY.ko.body,
    })
    expect(noticeSource(ko.title, ko.body)).toBe('일부 직접 입력')
    expect(noticeSource('', ' ')).toBe('기본 문구')
    expect(noticeSource('a', 'b')).toBe('직접 입력')
    expect(noticeOf(normal.service, 'ja')).toEqual({ title: '', body: '' })
  })
})
