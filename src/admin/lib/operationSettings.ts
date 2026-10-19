import type { Locale, OperationValues, SettingsChanges } from '../api/operationSettings'
import { CAMPAIGN_FOOTER } from './promotion'

export type SettingsSection = 'app' | 'credit' | 'institution' | 'attendancePush'
export interface SettingField {
  path: string
  label: string
  kind: 'version' | 'url' | 'amount' | 'days' | 'datetime' | 'time' | 'boolean' | 'title' | 'body'
  hint?: string
}
export const sections: { key: SettingsSection; label: string; description: string }[] = [
  {
    key: 'app',
    label: '앱 버전·스토어',
    description: '플랫폼별 최소 지원 버전과 업데이트 주소를 관리해요.',
  },
  {
    key: 'credit',
    label: '무료 사진·차감',
    description: '지급 정책은 최초 장부 생성에 적용돼요. 기존 잔액을 일괄 재설정하지 않아요.',
  },
  {
    key: 'institution',
    label: '기관 이용',
    description: '체험은 신규 부여 대상에 적용해요. 이미 부여한 체험 이력은 바꾸지 않아요.',
  },
  {
    key: 'attendancePush',
    label: '출석 알림',
    description: '한국 시간 08:00~20:59에 발송해요. 설정 저장은 즉시 발송 명령이 아니에요.',
  },
]
export const fields: SettingField[] = [
  ...(['ios', 'android'] as const).flatMap((p) => [
    {
      path: `app.minVersion.${p}`,
      label: `${p === 'ios' ? 'iOS' : 'Android'} 최소 버전`,
      kind: 'version' as const,
      hint: '해당 스토어에 실제 공개된 버전만 설정하세요. 예: 2.7.0',
    },
    {
      path: `app.storeUrl.${p}`,
      label: `${p === 'ios' ? 'iOS' : 'Android'} 스토어 URL`,
      kind: 'url' as const,
      hint: '비우면 서버 URL을 삭제하고 앱의 기본 주소를 사용해요.',
    },
  ]),
  {
    path: 'credit.signupGrant',
    label: '신규 가입 지급량',
    kind: 'amount',
    hint: '장부가 처음 생성되는 신규 가입 계정에 적용해요.',
  },
  {
    path: 'credit.migrationGrant',
    label: '기존 가입자 최초 지급량',
    kind: 'amount',
    hint: '고정 가입자 기준일 이전 계정의 최초 장부 생성에 적용해요.',
  },
  {
    path: 'credit.dailyGrant',
    label: '일일 출석 지급량',
    kind: 'amount',
    hint: 'APP의 10장 고정 문구 수정 전에는 변경할 수 없어요.',
  },
  {
    path: 'credit.cap',
    label: '출석 적립 상한',
    kind: 'amount',
    hint: '관리자 지급의 상한이 아니에요. APP 게이지 수정 전에는 변경할 수 없어요.',
  },
  {
    path: 'credit.enforcementStartsAt',
    label: '장수 차감 시작 시각 (KST)',
    kind: 'datetime',
    hint: '비우면 차감·장수/출석 API가 비활성화돼요. 고정 가입자 기준일은 바뀌지 않아요.',
  },
  {
    path: 'institution.trialPeriod',
    label: '가입 체험 기간',
    kind: 'days',
    hint: '0~365일 정수. 0일이면 신규 체험을 부여하지 않아요.',
  },
  {
    path: 'institution.gracePeriod',
    label: '만료 후 유예 기간',
    kind: 'days',
    hint: '실제 이용 종료일 + 현재 유예 기간으로 즉시 판정해요. 축소하면 기존 기관의 접근도 바뀔 수 있어요.',
  },
  { path: 'attendancePush.enabled', label: '출석 알림 활성화', kind: 'boolean' },
  {
    path: 'attendancePush.sendTime',
    label: '발송 시각 (KST)',
    kind: 'time',
    hint: '08:00~20:59. 시각이 지난 뒤 21시 전에 켜면 당일 다음 주기에 발송될 수 있어요.',
  },
  ...(['ko', 'en', 'ja'] as const).flatMap((locale) => [
    {
      path: `attendancePush.copy.${locale}.title`,
      label: `${locale} 제목`,
      kind: 'title' as const,
    },
    { path: `attendancePush.copy.${locale}.body`, label: `${locale} 본문`, kind: 'body' as const },
  ]),
]
export function leaf(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (item, key) =>
        item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined,
      value,
    )
}
export function putLeaf(target: SettingsChanges, path: string, value: unknown) {
  const keys = path.split('.')
  let node = target
  keys.slice(0, -1).forEach((key) => {
    node[key] ??= {}
    node = node[key] as SettingsChanges
  })
  node[keys[keys.length - 1]] = value
}
/** Java Duration의 ISO 기간(PT336H 등)을 일수로 표시한다. 원본은 변경할 때만 변환한다. */
export function durationDays(value: string): string {
  const match = /^(?:P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?)$/.exec(value)
  if (!match) return value
  return String(
    Number(match[1] ?? 0) +
      Number(match[2] ?? 0) / 24 +
      Number(match[3] ?? 0) / 1440 +
      Number(match[4] ?? 0) / 86400,
  )
}
export function toDraft(values: OperationValues): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => {
      const value = leaf(values, f.path)
      return [
        f.path,
        f.kind === 'days'
          ? durationDays(String(value))
          : f.kind === 'datetime' && value
            ? new Date(new Date(String(value)).getTime() + 9 * 3600000).toISOString().slice(0, 19)
            : String(value ?? ''),
      ]
    }),
  )
}
export function changedFields(
  values: OperationValues,
  draft: Record<string, string>,
  section: SettingsSection,
) {
  const original = toDraft(values)
  return fields.filter(
    (f) => f.path.startsWith(`${section}.`) && draft[f.path] !== original[f.path],
  )
}
export function buildChanges(
  values: OperationValues,
  draft: Record<string, string>,
  section: SettingsSection,
): SettingsChanges {
  const changes: SettingsChanges = {}
  changedFields(values, draft, section).forEach((f) => {
    const value = draft[f.path]
    putLeaf(
      changes,
      f.path,
      f.kind === 'amount'
        ? Number(value)
        : f.kind === 'days'
          ? `P${value}D`
          : f.kind === 'boolean'
            ? value === 'true'
            : f.kind === 'datetime'
              ? value
                ? new Date(`${value}+09:00`).toISOString()
                : null
              : f.kind === 'url'
                ? value || null
                : value,
    )
  })
  return changes
}
export function fieldError(field: SettingField, value: string): string | null {
  switch (field.kind) {
    case 'version':
      return /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)
        ? null
        : '선행 0 없는 숫자 major.minor.patch 형식으로 입력하세요.'
    case 'url': {
      if (!value) return null
      try {
        if (
          !/^https:\/\//i.test(value) ||
          /[\s"<>\\^`{|}]/.test(value) ||
          /%(?![0-9a-f]{2})/i.test(value)
        )
          return '올바른 HTTPS 스토어 주소를 입력하세요.'
        const u = new URL(value)
        const host = field.path.endsWith('ios') ? 'apps.apple.com' : 'play.google.com'
        return u.protocol === 'https:' &&
          u.hostname === host &&
          !u.username &&
          !u.password &&
          !u.hash &&
          !value.includes('#') &&
          !u.port &&
          /^https:\/\/[^/]+\/[^?#]*/i.test(value)
          ? null
          : `https://${host}/ 경로를 입력하세요. 사용자 정보·fragment는 사용할 수 없어요.`
      } catch {
        return '올바른 스토어 URL을 입력하세요.'
      }
    }
    case 'amount':
    case 'days':
      return /^[0-9]+$/.test(value) && Number(value) <= (field.kind === 'days' ? 365 : 10000)
        ? null
        : `0~${field.kind === 'days' ? 365 : '10,000'} 정수를 입력하세요.`
    case 'time':
      return /^(0[89]|1[0-9]|20):[0-5][0-9]$/.test(value)
        ? null
        : 'KST 08:00~20:59 사이로 입력하세요.'
    case 'datetime': {
      if (!value) return null
      const parsed = Date.parse(`${value}+09:00`)
      const roundTrip = Number.isFinite(parsed)
        ? new Date(parsed + 9 * 3600000).toISOString().slice(0, value.length)
        : ''
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) && roundTrip === value
        ? null
        : '존재하는 한국 시간 날짜와 시각을 입력하세요.'
    }
    case 'title':
    case 'body':
      return value.trim().length > 0 && value.length <= (field.kind === 'title' ? 100 : 1000)
        ? null
        : `${field.kind === 'title' ? '제목은 1~100' : '본문은 1~1,000'}자로 입력하세요.`
    default:
      return null
  }
}
export function attendanceDisplay(locale: Locale, title: string, body: string) {
  const prefix = { ko: '(광고)', en: '(Ad)', ja: '(広告)' }[locale]
  const footer = {
    ko: CAMPAIGN_FOOTER,
    en: 'CheeseMoa · Opt out: My info > Benefits & event notifications',
    ja: 'CheeseMoa · 配信停止: マイページ > 特典・イベント通知',
  }[locale]
  return {
    title: title.trim().startsWith(prefix) ? title.trim() : `${prefix} ${title.trim()}`,
    body: body.trim().endsWith(footer) ? body.trim() : `${body.trim()}\n${footer}`,
  }
}
export function attendancePayloadError(draft: Record<string, string>): string | null {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const display = attendanceDisplay(
      locale,
      draft[`attendancePush.copy.${locale}.title`],
      draft[`attendancePush.copy.${locale}.body`],
    )
    const bytes = new TextEncoder()
    if (
      bytes.encode(display.title).length > 400 ||
      bytes.encode(
        JSON.stringify({
          notification: display,
          data: { type: 'DAILY_ATTENDANCE', userId: '9223372036854775807' },
        }),
      ).length > 1800
    )
      return `${locale} 자동 광고 고지를 포함한 알림이 너무 커요. 제목·본문을 줄여 주세요.`
  }
  return null
}
