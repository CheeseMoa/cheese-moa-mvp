import type { Locale, OperationValues, SettingsChanges } from '../api/operationSettings'
import { CAMPAIGN_FOOTER } from './promotion'

export type SettingsSection =
  'app' | 'credit' | 'institution' | 'attendancePush' | 'quest' | 'institutionSubscription'
export interface SettingField {
  path: string
  label: string
  kind:
    | 'version'
    | 'url'
    | 'amount'
    | 'reward'
    | 'days'
    | 'datetime'
    | 'time'
    | 'boolean'
    | 'title'
    | 'body'
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
    key: 'quest',
    label: '퀘스트·보상',
    description:
      '보상 변경은 변경 이후 신규 참여자에게만 적용돼요. 기존 참여자는 참여 당시 보상을 유지해요.',
  },
  {
    key: 'institution',
    label: '기관 이용',
    description: '체험은 신규 부여 대상에 적용해요. 이미 부여한 체험 이력은 바꾸지 않아요.',
  },
  {
    key: 'institutionSubscription',
    label: '기관 월 구독',
    description: '신규 구독 안내와 구매를 관리해요. 기존 구독의 이용 권한·갱신·복원은 유지돼요.',
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
    path: 'quest.enabled',
    label: '퀘스트 사용',
    kind: 'boolean',
    hint: '개인 계정의 일반 모임이 대상이에요. 친구 초대 보상은 실제 가입 완료 후 지급해요.',
  },
  ...(
    [
      ['createGroupReward', '모임 만들기 보상'],
      ['uploadPhotoReward', '첫 사진 업로드 보상'],
      ['inviteFriendReward', '친구 초대 완료 보상'],
    ] as const
  ).map(([key, label]) => ({
    path: `quest.${key}`,
    label: `${label} (장)`,
    kind: 'reward' as const,
    hint:
      key === 'inviteFriendReward'
        ? '다른 두 보상 각각보다 커야 하며 최대 10,000장이에요.'
        : '양의 정수로 입력하세요. 친구 초대 완료 보상보다 작아야 해요.',
  })),
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
  {
    path: 'institutionSubscription.offerEnabled',
    label: '신규 구독 안내',
    kind: 'boolean',
    hint: '안내를 비활성화하려면 신규 구매도 함께 비활성화해 주세요.',
  },
  {
    path: 'institutionSubscription.purchaseEnabled',
    label: '신규 구독 구매',
    kind: 'boolean',
    hint: '신규 구독 안내가 활성화되어 있어야 켤 수 있어요.',
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
  if (section === 'quest' && !hasQuestSettings(values)) return []
  if (section === 'institutionSubscription' && !hasSubscriptionSettings(values)) return []
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
      f.kind === 'amount' || f.kind === 'reward'
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
    case 'reward':
      return /^[0-9]+$/.test(value) && Number(value) > 0 && Number(value) <= 10000
        ? null
        : '1~10,000 사이의 정수 장수를 입력하세요.'
    case 'boolean':
      return value === 'true' || value === 'false' ? null : '활성 여부를 선택해 주세요.'
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
export const questImpact = [
  '보상 변경은 변경 이후 신규 참여자에게만 적용돼요. 기존 참여자의 보상·잔액·지급 이력은 다시 계산하지 않아요.',
  '비활성화하면 신규 참여와 신규 보상 지급을 중단해요. 기존 참여자의 달성 기록은 지급 대기로 보존돼요.',
  '다시 활성화하면 지급 대기 보상을 참여 당시 장수로 한 번만 지급해요. 이미 지급한 보상·달성 이력·완료 확인 상태는 유지돼요.',
]
export const subscriptionImpact = [
  '두 설정을 활성화해도 출시 준비와 스토어 상품 승인이 확인되어야 실제 안내·구매가 가능해요. 출시 준비 상태는 이 화면에서 변경할 수 없어요.',
  '수동 기관 이용 기간·가입 체험과 유예가 모두 끝난 계정만 신규 구매할 수 있어요. 예약된 이용 기간이나 다른 스토어의 구독·진행 중 결제가 있어도 구매를 제한해요.',
  '비활성화해도 기존 구독의 권한·갱신·복원·관리 경로는 유지돼요. 구독 해지나 환불을 실행하지 않아요.',
  '가격·통화·갱신일은 스토어에서 결정해요. 기관 체험·수동 이용 기간과 별도로 관리해요.',
]

export function hasSubscriptionSettings(values: OperationValues): boolean {
  return (
    typeof values.institutionSubscription?.offerEnabled === 'boolean' &&
    typeof values.institutionSubscription?.purchaseEnabled === 'boolean'
  )
}

export const missingPolicyMessage = '기록 없음 · 복원 시 현재 값 유지'
export function missingHistoryPolicies(values: OperationValues): string[] {
  return [
    ...(values.quest == null ? ['퀘스트·보상'] : []),
    ...(values.institutionSubscription == null ? ['기관 월 구독'] : []),
  ]
}

/** CHMO-978 복원 계약: 원본 이력에 없던 정책과 고정 가입자 기준일은 현재 값을 유지한다. */
export function restorePreview(current: OperationValues, target: OperationValues): OperationValues {
  return {
    ...target,
    credit: { ...target.credit, migrationCutoffAt: current.credit.migrationCutoffAt },
    quest: target.quest ?? current.quest,
    institutionSubscription: target.institutionSubscription ?? current.institutionSubscription,
  }
}

/** 누락을 OFF·기본 보상으로 채우면 구 서버에 없는 정책을 저장할 수 있어 구분한다. */
export function hasQuestSettings(values: OperationValues): boolean {
  const quest = values.quest
  return Boolean(
    quest &&
    typeof quest.enabled === 'boolean' &&
    [quest.createGroupReward, quest.uploadPhotoReward, quest.inviteFriendReward].every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    ),
  )
}

export function settingDisplay(field: SettingField, value: string): string {
  if (field.kind === 'boolean' && (value === 'true' || value === 'false'))
    return value === 'true' ? '활성' : '비활성'
  return value || '없음'
}

export function settingsErrors(
  values: OperationValues,
  draft: Record<string, string>,
  section: SettingsSection,
) {
  const changed = changedFields(values, draft, section)
  // 퀘스트는 수정하지 않은 보상도 함께 비교한다(BE QuestPolicy.valid).
  const checking =
    (section === 'quest' || section === 'institutionSubscription') && changed.length
      ? fields.filter((field) => field.path.startsWith(`${section}.`))
      : changed
  const errors = checking.flatMap((field) => {
    const error = fieldError(field, draft[field.path])
    return error ? [{ path: field.path, label: field.label, error }] : []
  })
  if (
    section === 'quest' &&
    changed.length &&
    !errors.length &&
    Number(draft['quest.inviteFriendReward']) <=
      Math.max(Number(draft['quest.createGroupReward']), Number(draft['quest.uploadPhotoReward']))
  ) {
    errors.push({
      path: 'quest.inviteFriendReward',
      label: '친구 초대 완료 보상 (장)',
      error: '친구 초대 완료 보상은 모임 만들기와 첫 사진 업로드 보상 각각보다 커야 해요.',
    })
  }
  if (
    section === 'institutionSubscription' &&
    changed.length &&
    draft['institutionSubscription.purchaseEnabled'] === 'true' &&
    draft['institutionSubscription.offerEnabled'] !== 'true'
  ) {
    errors.push({
      path: 'institutionSubscription.purchaseEnabled',
      label: '신규 구독 구매',
      error: '신규 구매를 활성화하려면 신규 구독 안내도 활성화해 주세요.',
    })
  }
  return errors
}

export function restoreCompatibilityError(
  current: OperationValues,
  target: OperationValues,
): string | null {
  if (
    (target.quest != null && (!hasQuestSettings(current) || !hasQuestSettings(target))) ||
    (current.quest && target.quest == null && !hasSubscriptionSettings(current))
  )
    return '현재 설정과 이력의 퀘스트 항목이 일치하지 않아 전체 복원을 진행할 수 없어요. 최신 설정을 조회하고 필요한 항목만 직접 변경해 주세요.'
  if (
    target.institutionSubscription != null &&
    (!hasSubscriptionSettings(current) || !hasSubscriptionSettings(target))
  )
    return '현재 설정과 이력의 월 구독 항목을 확인할 수 없어 전체 복원을 진행할 수 없어요. 최신 설정을 조회해 주세요.'
  if (
    target.credit.dailyGrant !== current.credit.dailyGrant ||
    target.credit.cap !== current.credit.cap
  )
    return '앱 고정 문구·게이지 후속 전에는 일일 지급량·출석 상한이 달라지는 복원을 제한해요.'
  return null
}

export function settingsEnvironmentLabel(origin: string | undefined, mock: boolean): string {
  if (mock) return '로컬 목 · 실제 서버에 저장되지 않아요'
  try {
    const host = new URL(origin || 'https://api.cheese-moa.com').host
    return host === 'api.cheese-moa.com' ? `운영 서버 · ${host}` : `연결 서버 · ${host}`
  } catch {
    return '서버 주소를 확인할 수 없어요'
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
