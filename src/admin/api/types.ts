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

// ── 신고·문의 (CHMO-862 — BE CHMO-861) ──────────────────────────────

/**
 * BE ReportType — 앱 신고·문의 폼의 유형(CHMO-860 확정 6종). 뒤의 둘이 **신고**(사진·사람에 대한
 * 조치 요청)이고 나머지 넷이 **문의**다(BE `ReportType.isReport()`와 같은 경계).
 * 표시명은 lib/format이 맡는다 — 미지 값이 와도 원문으로 폴백한다.
 */
export type AdminReportType =
  'APP_ERROR' | 'CLASSIFICATION' | 'ACCOUNT' | 'OTHER' | 'DELETION_REQUEST' | 'INAPPROPRIATE'

/**
 * BE ReportStatus — 접수됨 → 확인 중 → 답변 완료 / 종료.
 * 기관 문의(CHMO-810)와 같은 결정으로 **전이 규칙이 없다**(잘못 누른 값을 되돌릴 수 있게).
 * 예외 하나: 답변이 없는 건을 `ANSWERED`로 직접 바꾸면 VALID400(답 없는 '답변 완료' 방지) —
 * 답변 완료는 [답변 보내기]가 만드는 상태다.
 */
export type AdminReportStatus = 'RECEIVED' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED'

/**
 * BE AdminReportSummaryResponse — 목록 한 행이자 **PATCH 응답과 같은 형태**(기관 문의와 같은 결 —
 * 전이 성공 시 재조회 없이 그 행만 바꿔 끼운다).
 *
 * `groupId`·`photoId`는 **접수 시점 식별자를 유지**하고, 가리키던 자원이 지워지면 이름만 null이
 * 된다(BE 정책) — 그래서 `groupId`가 있는데 `groupName`이 null이면 "지워진 모임"이다.
 */
export interface AdminReportRow {
  id: number
  type: AdminReportType
  status: AdminReportStatus
  /** 내용 앞 60자 — 사진 신고는 내용 없이 접수될 수 있어 null */
  preview: string | null
  userId: number
  userNickname: string | null
  /** KAKAO/NAVER/GOOGLE/APPLE 복수 가능 — PIN 계정은 빈 배열 */
  socialProviders: string[]
  groupId: number | null
  groupName: string | null
  /** 사진 신고면 그 사진 — 목록 행엔 이벤트명이 없다(상세 `photo.eventName`에만) */
  photoId: number | null
  hasAttachments: boolean
  createdAt: string
  /** 마지막 답변 시각 — 재답변도 갱신한다 */
  answeredAt: string | null
  updatedAt: string
}

/** BE AdminReportDetailResponse.Photo — `url`은 운영 확인용 **원본** presigned GET(짧은 만료) */
export interface AdminReportPhoto {
  id: number
  url: string
  eventId: number
  eventName: string
}

/** BE AdminReportDetailResponse.Client — 앱이 접수 때 자동으로 싣는 진단 정보(전부 선택) */
export interface AdminReportClient {
  appVersion: string | null
  /** BE ReportClientPlatform(IOS|ANDROID) */
  platform: string | null
  osVersion: string | null
  deviceModel: string | null
}

/** BE AdminReportDetailResponse.Reply — `answeredBy`는 답한 관리자의 userId(FK 없음 — 감사 단서) */
export interface AdminReportReply {
  content: string
  answeredAt: string
  answeredBy: number | null
}

/**
 * BE AdminReportDetailResponse — 목록 행 + 상세. `POST …/reply`의 응답도 이 형태다
 * (답변을 보낸 뒤 패널을 재조회 없이 그대로 갱신한다).
 */
export interface AdminReportDetail extends AdminReportRow {
  /** 내용 전문 — 사진 신고는 사유 선택만으로 접수돼 null일 수 있다 */
  content: string | null
  /** 첨부 스크린샷(최대 3) — presigned GET */
  attachments: { url: string }[]
  /** 신고 사진 — 지워졌으면 null이고 `photoDeleted`가 true */
  photo: AdminReportPhoto | null
  photoDeleted: boolean
  /** 신고자의 그 모임 역할(BE SpaceRole EDITOR|VIEWER) — 모임이 없거나 이미 나갔으면 null */
  reporterRole: string | null
  /** 네 값이 모두 비면 null(웹 접수·구버전 앱) */
  client: AdminReportClient | null
  /** [이어서 문의하기]로 접수됐으면 이전 문의 — 지워졌으면 null */
  followUpOf: { id: number; preview: string | null } | null
  reply: AdminReportReply | null
}

/**
 * 목록 `status` 쿼리 값 그대로 — 탭 4개가 이 넷에 1:1로 대응한다. 목록 밖 값은 COMMON400이라
 * 화면이 자유 조합하지 않고 이 유니온만 쓴다(기관 문의 필터와 같은 규칙).
 */
export type AdminReportStatusFilter = 'RECEIVED,IN_PROGRESS' | 'ANSWERED' | 'CLOSED' | 'ALL'

/** 목록 `type` 쿼리 값 — `신고만`은 신고 2종 콤마 복수 */
export type AdminReportTypeFilter =
  'ALL' | 'DELETION_REQUEST,INAPPROPRIATE' | 'APP_ERROR' | 'CLASSIFICATION' | 'ACCOUNT' | 'OTHER'

export interface AdminReportListParams {
  page: number
  size?: number
  /** 생략하면 BE 기본값(`RECEIVED,IN_PROGRESS` = 처리 대기) */
  status?: AdminReportStatusFilter
  /** 생략하면 BE 기본값(`ALL`) */
  type?: AdminReportTypeFilter
}
