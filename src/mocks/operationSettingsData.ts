/** 로컬 시연 전용 합성 값. 운영 스냅샷·계약 테스트 응답으로 사용하지 않는다. */
import type { OperationSettings } from '../admin/api/operationSettings'
export function createOperationSettingsDemo(): OperationSettings {
  return {
    revision: 0,
    updatedAt: '2026-01-01T00:00:00Z',
    settings: {
      app: {
        minVersion: { ios: '1.0.0', android: '1.0.0' },
        storeUrl: {
          ios: 'https://apps.apple.com/app/id123',
          android: 'https://play.google.com/store/apps/details?id=demo',
        },
      },
      credit: {
        signupGrant: 25,
        dailyGrant: 10,
        cap: 500,
        migrationGrant: 25,
        enforcementStartsAt: '2026-01-01T00:00:00Z',
        migrationCutoffAt: '2026-01-01T00:00:00Z',
      },
      institution: { trialPeriod: 'PT336H', gracePeriod: 'PT168H' },
      attendancePush: {
        enabled: false,
        sendTime: '19:00',
        copy: {
          ko: { title: '오늘의 출석', body: '앱에서 출석하고 사진 장수를 받아요.' },
          en: { title: 'Check in today', body: 'Open the app to check in.' },
          ja: { title: '今日の出席', body: 'アプリで出席を確認しましょう。' },
        },
      },
    },
    readOnly: {
      uploadLimits: { perRequest: 500, perEvent: 1000, perGroup: 5000 },
      appCompatibilityNotes: [
        '일일 지급량 변경 전 APP의 고정 문구 변경 필요',
        '출석 상한 변경 전 APP의 고정 게이지 변경 필요',
      ],
    },
  }
}
