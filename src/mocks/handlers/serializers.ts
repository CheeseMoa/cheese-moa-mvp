/**
 * DB 레코드 → API 응답 스키마 직렬화 (docs/api-spec.md §2).
 * pin·모임 비밀번호·학부모 비밀번호 평문은 여기서 절대 노출하지 않는다
 * (평문은 invite/share 전용 핸들러만 반환).
 */
import type { EventItem, Group, User } from '../../types/api'
import {
  albumCountOf,
  eventCountOf,
  memberCountOf,
  photoCountOfEvent,
  type DbEvent,
  type DbGroup,
  type DbUser,
} from '../db'

export function toUser(user: DbUser): User {
  return { id: user.id, nickname: user.nickname, createdAt: user.createdAt }
}

export function shareUrlOf(group: DbGroup): string {
  return `${window.location.origin}/share/${group.share.token}`
}

export function joinUrlOf(group: DbGroup): string {
  return `${window.location.origin}/join/${group.joinKey}`
}

/** 목록 응답은 share 생략(스펙 예시와 동일), 상세 응답은 includeShare로 포함 */
export function toGroup(group: DbGroup, opts: { includeShare?: boolean } = {}): Group {
  return {
    id: group.id,
    name: group.name,
    memberCount: memberCountOf(group.id),
    eventCount: eventCountOf(group.id),
    joinKey: group.joinKey,
    role: null,
    ...(opts.includeShare
      ? { share: { token: group.share.token, url: shareUrlOf(group), hasPassword: true } }
      : {}),
    createdAt: group.createdAt,
  }
}

export function toEvent(event: DbEvent): EventItem {
  return {
    id: event.id,
    groupId: event.groupId,
    name: event.name,
    date: event.date,
    status: event.status,
    photoCount: photoCountOfEvent(event.id),
    albumCount: albumCountOf(event.id),
    createdAt: event.createdAt,
    publishedAt: event.publishedAt,
  }
}
