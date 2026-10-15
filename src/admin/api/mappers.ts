/**
 * BE 어드민 DTO → 어드민 타입 정규화 (CHMO-379) — src/admin/ 내부 전용.
 *
 * 필드명은 그대로 두고(types.ts 주석 참조) **키 누락·null만 정규화**한다: 배열은 빈 배열로,
 * nullable은 명시적 null로 접어 화면이 `?.`·`NaN` 없이 읽게 한다. 시각 'Z' 보정은
 * client.ts(normalizeTimestamps)가 이미 끝냈다.
 */
import type {
  AdminCampaign,
  AdminCampaignRecipients,
  AdminCampaignStatus,
  AdminCreditAdjustment,
  AdminCreditLedgerItem,
  AdminCursorPage,
  AdminGroupDetail,
  AdminGroupEvent,
  AdminGroupMember,
  AdminGroupRow,
  AdminInquiry,
  AdminOrganizationSubscription,
  AdminOrganizationSubscriptionRow,
  AdminPopup,
  AdminPopupAudience,
  AdminPopupHideOption,
  AdminPopupImageUpload,
  AdminPopupLinkTarget,
  AdminPopupLocale,
  AdminPopupStatus,
  AdminProfile,
  AdminReportDetail,
  AdminReportRow,
  AdminRecentGroup,
  AdminStats,
  AdminSubscriptionPeriod,
  AdminUserCredits,
  AdminUserRow,
} from './types'

export interface RawAdminProfile {
  userId: number
  nickname: string
  role: string
}

export function toAdminProfile(raw: RawAdminProfile): AdminProfile {
  return { userId: raw.userId, nickname: raw.nickname, role: raw.role }
}

export interface RawAdminStats {
  totals?: { users?: number; groups?: number; events?: number; photos?: number }
  last7Days?: { newGroups?: number; newEvents?: number; newPhotos?: number }
  recentGroups?: RawAdminRecentGroup[]
}

export interface RawAdminRecentGroup {
  groupId: number
  memberCount?: number
  createdAt: string
}

export function toAdminStats(raw: RawAdminStats): AdminStats {
  return {
    totals: {
      users: raw.totals?.users ?? 0,
      groups: raw.totals?.groups ?? 0,
      events: raw.totals?.events ?? 0,
      photos: raw.totals?.photos ?? 0,
    },
    last7Days: {
      newGroups: raw.last7Days?.newGroups ?? 0,
      newEvents: raw.last7Days?.newEvents ?? 0,
      newPhotos: raw.last7Days?.newPhotos ?? 0,
    },
    recentGroups: (raw.recentGroups ?? []).map(toAdminRecentGroup),
  }
}

function toAdminRecentGroup(raw: RawAdminRecentGroup): AdminRecentGroup {
  return {
    groupId: raw.groupId,
    memberCount: raw.memberCount ?? 0,
    createdAt: raw.createdAt,
  }
}

export interface RawAdminGroupRow {
  groupId: number
  groupType?: string
  memberCount?: number
  eventCount?: number
  photoCount?: number
  createdAt: string
}

export function toAdminGroupRow(raw: RawAdminGroupRow): AdminGroupRow {
  return {
    groupId: raw.groupId,
    // 구계약(CHMO-621 이전) 응답은 키가 없다 — 서비스 매퍼와 같은 해석(생략 = 비즈니스)
    groupType: raw.groupType ?? 'BUSINESS',
    memberCount: raw.memberCount ?? 0,
    eventCount: raw.eventCount ?? 0,
    photoCount: raw.photoCount ?? 0,
    createdAt: raw.createdAt,
  }
}

export interface RawAdminGroupDetail {
  groupId: number
  createdAt: string
  ownerUserId?: number | null
  ownerNickname?: string | null
  memberCount?: number
  members?: RawAdminGroupMember[]
  events?: RawAdminGroupEvent[]
}

export interface RawAdminGroupMember {
  userId: number
  nickname: string
  role: string
  status: string
  joinedAt: string
}

export interface RawAdminGroupEvent {
  eventId: number
  name: string
  status: string
  eventDate?: string | null
  photoCount?: number
  albumCount?: number
  createdAt: string
  publishedAt?: string | null
}

export function toAdminGroupDetail(raw: RawAdminGroupDetail): AdminGroupDetail {
  return {
    groupId: raw.groupId,
    createdAt: raw.createdAt,
    ownerUserId: raw.ownerUserId ?? null,
    ownerNickname: raw.ownerNickname ?? null,
    memberCount: raw.memberCount ?? 0,
    members: (raw.members ?? []).map(toAdminGroupMember),
    events: (raw.events ?? []).map(toAdminGroupEvent),
  }
}

function toAdminGroupMember(raw: RawAdminGroupMember): AdminGroupMember {
  return {
    userId: raw.userId,
    nickname: raw.nickname,
    // BE SpaceRole·SpaceUserStatus는 두 값뿐이지만, 미지 값이 와도 표시는 labels 폴백이 받는다
    role: raw.role as AdminGroupMember['role'],
    status: raw.status as AdminGroupMember['status'],
    joinedAt: raw.joinedAt,
  }
}

function toAdminGroupEvent(raw: RawAdminGroupEvent): AdminGroupEvent {
  return {
    eventId: raw.eventId,
    name: raw.name,
    status: raw.status,
    eventDate: raw.eventDate ?? null,
    photoCount: raw.photoCount ?? 0,
    albumCount: raw.albumCount ?? 0,
    createdAt: raw.createdAt,
    publishedAt: raw.publishedAt ?? null,
  }
}

// ── 기관 도입 문의 (CHMO-811 — BE CHMO-810) ─────────────────────────

export interface RawAdminInquiry {
  id: number
  status: string
  organizationType: string
  organizationName: string
  region: string
  contactName: string
  contactPhone: string
  contactRole?: string | null
  privacyConsentVersion: string
  userId: number
  userNickname: string
  socialProviders?: string[]
  createdAt: string
  updatedAt: string
}

/**
 * 정규화 대상은 둘뿐이다 — 선택 항목 `contactRole`(null)과 `socialProviders`(PIN 계정은 빈
 * 배열이고 키 자체가 생략될 수 있다). enum은 대문자 원문 그대로 두고 표시명은 lib/format이
 * 맡는다(미지 값은 원문 폴백 — 어드민 공통 규칙).
 */
export function toAdminInquiry(raw: RawAdminInquiry): AdminInquiry {
  return {
    id: raw.id,
    status: raw.status as AdminInquiry['status'],
    organizationType: raw.organizationType as AdminInquiry['organizationType'],
    organizationName: raw.organizationName,
    region: raw.region,
    contactName: raw.contactName,
    contactPhone: raw.contactPhone,
    contactRole: (raw.contactRole ?? null) as AdminInquiry['contactRole'],
    privacyConsentVersion: raw.privacyConsentVersion,
    userId: raw.userId,
    userNickname: raw.userNickname,
    socialProviders: raw.socialProviders ?? [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

// ── 신고·문의 (CHMO-862 — BE CHMO-861) ──────────────────────────────

export interface RawAdminReportRow {
  id: number
  type: string
  status: string
  preview?: string | null
  userId: number
  userNickname?: string | null
  socialProviders?: string[]
  groupId?: number | null
  groupName?: string | null
  photoId?: number | null
  hasAttachments?: boolean
  createdAt: string
  answeredAt?: string | null
  updatedAt: string
}

export interface RawAdminReportDetail extends RawAdminReportRow {
  content?: string | null
  attachments?: { url: string }[] | null
  photo?: { id: number; url: string; eventId: number; eventName: string } | null
  photoDeleted?: boolean
  reporterRole?: string | null
  client?: {
    appVersion?: string | null
    platform?: string | null
    osVersion?: string | null
    deviceModel?: string | null
  } | null
  followUpOf?: { id: number; preview?: string | null } | null
  reply?: { content: string; answeredAt: string; answeredBy?: number | null } | null
}

/**
 * 목록 행 — nullable은 명시적 null로, 배열은 빈 배열로 접는다. BE record는 null 필드도 키를
 * 싣지만(@JsonInclude 없음) 키 생략에도 같은 값이 나오게 둔다(어드민 공통 규칙).
 */
export function toAdminReportRow(raw: RawAdminReportRow): AdminReportRow {
  return {
    id: raw.id,
    type: raw.type as AdminReportRow['type'],
    status: raw.status as AdminReportRow['status'],
    preview: raw.preview ?? null,
    userId: raw.userId,
    userNickname: raw.userNickname ?? null,
    socialProviders: raw.socialProviders ?? [],
    groupId: raw.groupId ?? null,
    groupName: raw.groupName ?? null,
    photoId: raw.photoId ?? null,
    hasAttachments: raw.hasAttachments ?? false,
    createdAt: raw.createdAt,
    answeredAt: raw.answeredAt ?? null,
    updatedAt: raw.updatedAt,
  }
}

/** 상세 — 목록 행 정규화 위에 상세 필드를 같은 규칙으로 얹는다 */
export function toAdminReportDetail(raw: RawAdminReportDetail): AdminReportDetail {
  return {
    ...toAdminReportRow(raw),
    content: raw.content ?? null,
    attachments: raw.attachments ?? [],
    photo: raw.photo ?? null,
    photoDeleted: raw.photoDeleted ?? false,
    reporterRole: raw.reporterRole ?? null,
    client: raw.client
      ? {
          appVersion: raw.client.appVersion ?? null,
          platform: raw.client.platform ?? null,
          osVersion: raw.client.osVersion ?? null,
          deviceModel: raw.client.deviceModel ?? null,
        }
      : null,
    followUpOf: raw.followUpOf
      ? { id: raw.followUpOf.id, preview: raw.followUpOf.preview ?? null }
      : null,
    reply: raw.reply
      ? {
          content: raw.reply.content,
          answeredAt: raw.reply.answeredAt,
          answeredBy: raw.reply.answeredBy ?? null,
        }
      : null,
  }
}

// ── 이벤트 팝업 (CHMO-928 — BE CHMO-926) ────────────────────────────

/**
 * BE AdminPopupResponse(`@JsonInclude(NON_NULL)` + `@JsonUnwrapped content`) — 선택 필드
 * (ctaLabel·minAppVersion)는 비면 **키째 생략**된다. enum은 대문자 그대로 받는다(types.ts 원칙).
 */
export interface RawAdminPopup {
  popupId: number
  imageUrl: string
  title: string
  imageKey: string
  imageAlt: string
  ctaLabel?: string | null
  linkUrl: string
  linkTarget: string
  audience: string
  locale: string
  startsAt: string
  endsAt: string
  priority: number
  hideOption: string
  active: boolean
  minAppVersion?: string | null
  status: string
  createdBy: number
  updatedBy?: number | null
  createdAt: string
  updatedAt: string
}

export function toAdminPopup(raw: RawAdminPopup): AdminPopup {
  return {
    popupId: raw.popupId,
    imageUrl: raw.imageUrl,
    title: raw.title,
    imageKey: raw.imageKey,
    imageAlt: raw.imageAlt,
    // 빈 문자열도 '없음'으로 접는다 — 앱이 빈 옐로 필을 세우지 않는 것과 같은 판정
    ctaLabel: raw.ctaLabel ? raw.ctaLabel : null,
    linkUrl: raw.linkUrl,
    linkTarget: raw.linkTarget as AdminPopupLinkTarget,
    audience: raw.audience as AdminPopupAudience,
    locale: raw.locale as AdminPopupLocale,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    priority: raw.priority,
    hideOption: raw.hideOption as AdminPopupHideOption,
    active: raw.active,
    minAppVersion: raw.minAppVersion ? raw.minAppVersion : null,
    status: raw.status as AdminPopupStatus,
    createdBy: raw.createdBy,
    // 생성 직후엔 생성자가 곧 마지막 수정자다(BE가 updatedBy를 함께 채운다 — 방어적 폴백)
    updatedBy: raw.updatedBy ?? raw.createdBy,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

export interface RawAdminPopupImageUpload {
  key: string
  uploadUrl: string
  expiresAt: string
}

export function toAdminPopupImageUpload(raw: RawAdminPopupImageUpload): AdminPopupImageUpload {
  return { key: raw.key, uploadUrl: raw.uploadUrl, expiresAt: raw.expiresAt }
}

// ── 혜택 푸시 (CHMO-928 — BE CHMO-926) ──────────────────────────────

/** BE CampaignResponse(`@JsonInclude(NON_NULL)`) — 빈 필드는 키째 생략된다 */
export interface RawAdminCampaign {
  campaignId: number
  status: string
  title: string
  body: string
  link?: string | null
  testUserId?: number | null
  scheduledAt?: string | null
  createdBy: number
  createdAt: string
  sentAt?: string | null
  cancelledBy?: number | null
  cancelledAt?: string | null
  fcmMessageIds?: string[] | null
  failureCode?: string | null
}

export function toAdminCampaign(raw: RawAdminCampaign): AdminCampaign {
  return {
    campaignId: raw.campaignId,
    status: raw.status as AdminCampaignStatus,
    title: raw.title,
    body: raw.body,
    link: raw.link ?? null,
    testUserId: raw.testUserId ?? null,
    scheduledAt: raw.scheduledAt ?? null,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
    sentAt: raw.sentAt ?? null,
    cancelledBy: raw.cancelledBy ?? null,
    cancelledAt: raw.cancelledAt ?? null,
    fcmMessageIds: raw.fcmMessageIds ?? [],
    failureCode: raw.failureCode ?? null,
  }
}

export interface RawAdminCampaignRecipients {
  userCount?: number
  deviceCount?: number
}

export function toAdminCampaignRecipients(
  raw: RawAdminCampaignRecipients,
): AdminCampaignRecipients {
  return { userCount: raw.userCount ?? 0, deviceCount: raw.deviceCount ?? 0 }
}

// ── 사용자·장수·기관 구독 (CHMO-931 — BE CHMO-912) ─────────────────

export interface RawAdminCursorPage<T> {
  items?: T[]
  nextCursor?: number | null
  hasNext?: boolean
}

function toAdminCursorPage<R, T>(
  raw: RawAdminCursorPage<R> | undefined,
  item: (row: R) => T,
): AdminCursorPage<T> {
  return {
    items: (raw?.items ?? []).map(item),
    nextCursor: raw?.nextCursor ?? null,
    hasNext: raw?.hasNext ?? false,
  }
}

export interface RawAdminUserRow {
  userId: number
  nickname: string
  accountType?: string
}

export function toAdminUserRow(raw: RawAdminUserRow): AdminUserRow {
  return {
    userId: raw.userId,
    nickname: raw.nickname,
    // 미지 값이 와도 화면은 원문 폴백(format.accountTypeLabel) — 계정 유형은 둘뿐이지만 열어 둔다
    accountType: (raw.accountType ?? 'PERSONAL') as AdminUserRow['accountType'],
  }
}

export function toAdminUserSearchPage(raw: RawAdminCursorPage<RawAdminUserRow>): AdminCursorPage<AdminUserRow> {
  return toAdminCursorPage(raw, toAdminUserRow)
}

export interface RawAdminCreditLedgerItem {
  ledgerId: number
  delta: number
  balanceAfter: number
  reason: string
  groupId?: number | null
  groupName?: string | null
  eventId?: number | null
  eventName?: string | null
  memo?: string | null
  createdAt: string
}

export function toAdminCreditLedgerItem(raw: RawAdminCreditLedgerItem): AdminCreditLedgerItem {
  return {
    ledgerId: raw.ledgerId,
    delta: raw.delta,
    balanceAfter: raw.balanceAfter,
    reason: raw.reason,
    groupId: raw.groupId ?? null,
    groupName: raw.groupName ?? null,
    eventId: raw.eventId ?? null,
    eventName: raw.eventName ?? null,
    memo: raw.memo ?? null,
    createdAt: raw.createdAt,
  }
}

export interface RawAdminUserCredits {
  userId: number
  balance?: number
  ledger?: RawAdminCursorPage<RawAdminCreditLedgerItem>
}

export function toAdminUserCredits(raw: RawAdminUserCredits): AdminUserCredits {
  return {
    userId: raw.userId,
    balance: raw.balance ?? 0,
    ledger: toAdminCursorPage(raw.ledger, toAdminCreditLedgerItem),
  }
}

export interface RawAdminCreditAdjustment {
  userId: number
  delta: number
  balance: number
}

export function toAdminCreditAdjustment(raw: RawAdminCreditAdjustment): AdminCreditAdjustment {
  return { userId: raw.userId, delta: raw.delta, balance: raw.balance }
}

export interface RawAdminOrganizationSubscriptionRow {
  subscriptionId: number
  userId: number
  nickname?: string | null
  status: string
  accessUntil?: string | null
  graceEndsAt?: string | null
}

export function toAdminOrganizationSubscriptionRow(
  raw: RawAdminOrganizationSubscriptionRow,
): AdminOrganizationSubscriptionRow {
  return {
    subscriptionId: raw.subscriptionId,
    userId: raw.userId,
    nickname: raw.nickname ?? null,
    status: raw.status as AdminOrganizationSubscriptionRow['status'],
    accessUntil: raw.accessUntil ?? null,
    graceEndsAt: raw.graceEndsAt ?? null,
  }
}

export function toAdminOrganizationSubscriptionPage(
  raw: RawAdminCursorPage<RawAdminOrganizationSubscriptionRow>,
): AdminCursorPage<AdminOrganizationSubscriptionRow> {
  return toAdminCursorPage(raw, toAdminOrganizationSubscriptionRow)
}

export interface RawAdminSubscriptionPeriod {
  periodId: number
  accessFrom: string
  accessUntil: string
  amountKrw?: number
  paidOn: string
  payerName: string
  invoiceNo?: string | null
  memo?: string | null
  voidedAt?: string | null
}

export interface RawAdminOrganizationSubscription {
  organizationUserId: number
  nickname?: string | null
  accessStatus: string
  accessUntil?: string | null
  graceEndsAt?: string | null
  period: RawAdminSubscriptionPeriod
}

export function toAdminSubscriptionPeriod(raw: RawAdminSubscriptionPeriod): AdminSubscriptionPeriod {
  return {
    periodId: raw.periodId,
    accessFrom: raw.accessFrom,
    accessUntil: raw.accessUntil,
    amountKrw: raw.amountKrw ?? 0,
    paidOn: raw.paidOn,
    payerName: raw.payerName,
    invoiceNo: raw.invoiceNo ?? null,
    memo: raw.memo ?? null,
    voidedAt: raw.voidedAt ?? null,
  }
}

export function toAdminOrganizationSubscription(
  raw: RawAdminOrganizationSubscription,
): AdminOrganizationSubscription {
  return {
    organizationUserId: raw.organizationUserId,
    nickname: raw.nickname ?? null,
    accessStatus: raw.accessStatus as AdminOrganizationSubscription['accessStatus'],
    accessUntil: raw.accessUntil ?? null,
    graceEndsAt: raw.graceEndsAt ?? null,
    period: toAdminSubscriptionPeriod(raw.period),
  }
}
