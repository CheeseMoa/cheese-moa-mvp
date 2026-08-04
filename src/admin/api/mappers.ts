/**
 * BE 어드민 DTO → 어드민 타입 정규화 (CHMO-379) — src/admin/ 내부 전용.
 *
 * 필드명은 그대로 두고(types.ts 주석 참조) **키 누락·null만 정규화**한다: 배열은 빈 배열로,
 * nullable은 명시적 null로 접어 화면이 `?.`·`NaN` 없이 읽게 한다. 시각 'Z' 보정은
 * client.ts(normalizeTimestamps)가 이미 끝냈다.
 */
import type {
  AdminGroupDetail,
  AdminGroupEvent,
  AdminGroupMember,
  AdminGroupRow,
  AdminProfile,
  AdminRecentGroup,
  AdminStats,
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
  name: string
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
    name: raw.name,
    memberCount: raw.memberCount ?? 0,
    createdAt: raw.createdAt,
  }
}

export interface RawAdminGroupRow {
  groupId: number
  name: string
  memberCount?: number
  eventCount?: number
  photoCount?: number
  createdAt: string
}

export function toAdminGroupRow(raw: RawAdminGroupRow): AdminGroupRow {
  return {
    groupId: raw.groupId,
    name: raw.name,
    memberCount: raw.memberCount ?? 0,
    eventCount: raw.eventCount ?? 0,
    photoCount: raw.photoCount ?? 0,
    createdAt: raw.createdAt,
  }
}

export interface RawAdminGroupDetail {
  groupId: number
  name: string
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
    name: raw.name,
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
