/**
 * 어드민 화면 계약 타입 (CHMO-379) — 서비스 타입(src/types/api.ts)과 섞지 않는다
 * (격리 규칙 1: 관리자 코드는 src/admin/ 한 폴더에만).
 *
 * 필드명은 BE DTO(admin/dto — CHMO-378 스펙 2026-08-04 소스 대조)를 거의 그대로 따른다 —
 * 서비스처럼 개명(groupId→id)하지 않는 이유는 어드민이 BE 도메인을 그대로 보여주는
 * 운영 화면이라 계약과 화면 사이에 이름 층을 하나 더 둘 이득이 없어서다.
 * enum(role·status)도 BE 대문자 그대로 두고 표시명 변환은 lib/labels가 맡는다.
 */

/** BE AdminProfileResponse — GET /admin/me (CHMO-377). FE 어드민 진입 게이트가 쓴다 */
export interface AdminProfile {
  userId: number
  nickname: string
  /** BE UserRole — 이 응답이 온다 = ADMIN(아니면 ADMIN403) */
  role: string
}

/** BE AdminStatsResponse.RecentGroup — 최근 생성 모임(5개 고정, 생성일 내림차순) */
export interface AdminRecentGroup {
  groupId: number
  name: string
  memberCount: number
  createdAt: string
}

/** BE AdminStatsResponse — GET /admin/stats */
export interface AdminStats {
  totals: { users: number; groups: number; events: number; photos: number }
  last7Days: { newGroups: number; newEvents: number; newPhotos: number }
  recentGroups: AdminRecentGroup[]
}

/** BE AdminGroupSummaryResponse — GET /admin/groups 목록 한 행 */
export interface AdminGroupRow {
  groupId: number
  name: string
  memberCount: number
  eventCount: number
  photoCount: number
  createdAt: string
}

/** BE SpaceRole — 대문자 그대로(표시명은 lib/labels) */
export type AdminMemberRole = 'TEACHER' | 'PARENT'

/** BE SpaceUserStatus — 상세 멤버 목록은 PENDING(승인 대기 신청)도 포함한다 */
export type AdminMemberStatus = 'PENDING' | 'ACTIVE'

/** BE AdminGroupDetailResponse.Member — joinedAt은 CHMO-452 이전 행이면 백필 임의 시각 */
export interface AdminGroupMember {
  userId: number
  nickname: string
  role: AdminMemberRole
  status: AdminMemberStatus
  joinedAt: string
}

/**
 * BE MomentStatus — 어드민은 BE 상태를 그대로 보여준다(서비스 EventStatus 소문자 파생과 별개).
 * 미지의 값은 통과시키기 위해 string 유니온이 아니라 string으로 둔다 — 배지가 폴백 표기한다.
 */
export type AdminEventStatus = string

/** BE AdminGroupDetailResponse.Event */
export interface AdminGroupEvent {
  eventId: number
  name: string
  status: AdminEventStatus
  eventDate: string | null
  photoCount: number
  albumCount: number
  createdAt: string
  /** 미공개면 null */
  publishedAt: string | null
}

/** BE AdminGroupDetailResponse — GET /admin/groups/:groupId */
export interface AdminGroupDetail {
  groupId: number
  name: string
  createdAt: string
  /** 생성자 — 탈퇴 등으로 없을 수 있어 null 허용(BE Long) */
  ownerUserId: number | null
  ownerNickname: string | null
  /** ACTIVE 기준(서비스 화면과 같은 규칙) — members 행 수(PENDING 포함)와 다를 수 있다 */
  memberCount: number
  /** spaceUserId 오름차순(합류·신청 순) */
  members: AdminGroupMember[]
  /** eventId 내림차순(서비스 목록과 동일) */
  events: AdminGroupEvent[]
}

/** GET /admin/groups 쿼리 — BE 화이트리스트(createdAt·name × asc·desc), 기본 createdAt,desc */
export type AdminGroupSort = 'createdAt,desc' | 'createdAt,asc' | 'name,asc' | 'name,desc'

export interface AdminGroupListParams {
  page: number
  size?: number
  /** 모임명 부분 일치(대소문자 무시) — 공백이면 보내지 않는다 */
  q?: string
  sort?: AdminGroupSort
}
