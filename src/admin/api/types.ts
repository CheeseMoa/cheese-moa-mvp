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

/**
 * BE AdminStatsResponse.RecentGroup — 최근 생성 모임(5개 고정, 생성일 내림차순).
 * 모임 이름은 어드민 응답 어디에도 없다(BE CHMO-668) — 어드민은 모임을 groupId로만 식별한다.
 */
export interface AdminRecentGroup {
  groupId: number
  memberCount: number
  createdAt: string
}

/** BE AdminStatsResponse — GET /admin/stats */
export interface AdminStats {
  totals: { users: number; groups: number; events: number; photos: number }
  last7Days: { newGroups: number; newEvents: number; newPhotos: number }
  recentGroups: AdminRecentGroup[]
}

/** BE AdminGroupSummaryResponse — GET /admin/groups 목록 한 행(이름 없음 — CHMO-668) */
export interface AdminGroupRow {
  groupId: number
  memberCount: number
  eventCount: number
  photoCount: number
  createdAt: string
}

/** BE SpaceRole — 대문자 그대로(표시명은 lib/labels). CHMO-605 리네이밍(구 TEACHER/PARENT) */
export type AdminMemberRole = 'EDITOR' | 'VIEWER'

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

/** BE AdminGroupDetailResponse — GET /admin/groups/:groupId (모임 이름 없음 — CHMO-668) */
export interface AdminGroupDetail {
  groupId: number
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

/**
 * GET /admin/groups 정렬 — 기본 `createdAt,desc`.
 * BE 화이트리스트에는 `name`도 남아 있지만(CHMO-668은 값만 걷고 동작은 유지) **FE는 쓰지 않는다**:
 * 이름을 화면에 안 보여주면 무슨 기준으로 줄 세웠는지 확인할 방법이 없다. 같은 이유로 이름 검색(q)도
 * 보내지 않아 파라미터 자체가 없다.
 */
export type AdminGroupSort = 'createdAt,desc' | 'createdAt,asc'

export interface AdminGroupListParams {
  page: number
  size?: number
  sort?: AdminGroupSort
}

// ── 기관 도입 문의 (CHMO-811 — BE CHMO-810) ─────────────────────────

/**
 * BE OrganizationInquiryStatus — 접수됨 → 연락 완료 → 개통 / 종료.
 *
 * **전이 규칙이 없다**(BE CHMO-810 결정): 어느 상태에서 어느 상태로든 바꿀 수 있고, 같은 값을
 * 다시 보내도 에러가 아니다. 관리자가 잘못 누른 값을 화면에서 직접 고칠 수 있어야 한다는
 * 결정이라, 화면도 '허용 전이표'를 들지 않는다 — 종료 상태(개통·종료) 행에도 액션이 뜬다.
 * (초안에 있던 `INQUIRY400`은 폐기돼 존재하지 않는다 — 처리 코드를 두지 않는다.)
 */
export type AdminInquiryStatus = 'RECEIVED' | 'CONTACTED' | 'ONBOARDED' | 'CLOSED'

/** BE OrganizationType */
export type AdminOrganizationType = 'KINDERGARTEN' | 'DAYCARE' | 'ACADEMY' | 'OTHER'

/** BE ContactRole — 문의 폼의 선택 항목이라 null이 온다 */
export type AdminContactRole = 'DIRECTOR' | 'TEACHER' | 'STAFF'

/**
 * BE OrganizationInquiryResponse — 목록 한 행이자 **PATCH 응답과 같은 형태**라
 * 전이 성공 시 재조회 없이 그 행만 바꿔 끼운다.
 *
 * `contactPhone`은 마스킹하지 않는다(팀이 전화하려고 받은 값 · 관리자 전용 화면 — CHMO-802
 * 정책). 같은 `userId`가 여러 행일 수 있다(종료 후 재접수) — id가 행의 정체성이다.
 */
export interface AdminInquiry {
  id: number
  status: AdminInquiryStatus
  organizationType: AdminOrganizationType
  organizationName: string
  region: string
  contactName: string
  /** 하이픈 없는 숫자열 — 표시 포맷·tel: 링크는 lib/format이 만든다 */
  contactPhone: string
  contactRole: AdminContactRole | null
  privacyConsentVersion: string
  userId: number
  userNickname: string
  /** KAKAO/NAVER/GOOGLE/APPLE 복수 가능 — PIN 계정은 빈 배열 */
  socialProviders: string[]
  createdAt: string
  /** 마지막 전이 시각(감사 — 전이 이력 자체는 CloudWatch 액세스 로그, ADR 017) */
  updatedAt: string
}

/**
 * 목록 `status` 쿼리 값 그대로 — 탭 4개가 이 넷에 1:1로 대응한다(콤마 복수·`ALL` 지원).
 * 목록 밖 값은 COMMON400이라, 화면이 자유 입력으로 조합하지 않고 이 유니온만 쓴다.
 */
export type AdminInquiryFilter = 'RECEIVED,CONTACTED' | 'ONBOARDED' | 'CLOSED' | 'ALL'

export interface AdminInquiryListParams {
  page: number
  size?: number
  /** 생략하면 BE 기본값(`RECEIVED,CONTACTED` = 진행 중) */
  status?: AdminInquiryFilter
}
