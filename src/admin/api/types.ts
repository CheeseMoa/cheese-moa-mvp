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

/**
 * BE AdminStatsResponse.RecentUpload — 최근 사진이 반영된 이벤트(10개 고정, 반영 시각 내림차순 — CHMO-932).
 * "업로드 시각"은 사진이 **앨범에 반영된 시각**(분류 완료)이라 분류 중인 업로드는 몇 분 늦게 보인다
 * (BE 정책 — 업로드 기록은 7일 뒤 지워져 이력의 원천이 못 된다). 업로더는 그 이벤트에서 가장 최근
 * 반영된 사진의 업로더 — 옛 사진(CHMO-805 이전)이거나 탈퇴했으면 null.
 */
export interface AdminRecentUpload {
  eventId: number
  eventName: string
  groupId: number
  /** BE SpaceType 대문자 그대로 */
  groupType: string
  lastUploadedAt: string
  /** 이벤트 카드와 같은 그 이벤트 전체 사진 수 */
  photoCount: number
  uploaderUserId: number | null
  uploaderNickname: string | null
}

/**
 * BE AdminStatsResponse — GET /admin/stats. `activeGroups`·`uploaders`·`recentUploads`는
 * `excludedUserIds`(서버 설정 `ADMIN_STATS_EXCLUDED_USER_IDS` — 운영·테스트 계정)가 올린 사진을
 * 뺀 값이고 **나머지 필드는 전체 기준 그대로**다(CHMO-932 — 기존 지표의 뜻을 바꾸지 않았다).
 */
export interface AdminStats {
  totals: { users: number; groups: number; events: number; photos: number }
  last7Days: {
    newGroups: number
    newEvents: number
    newPhotos: number
    /** 최근 7일 반영된 사진이 있는 모임 수 */
    activeGroups: number
    /** 그 사진들의 고유 업로더 수(업로더 없는 옛 사진은 안 센다) */
    uploaders: number
  }
  recentGroups: AdminRecentGroup[]
  recentUploads: AdminRecentUpload[]
  /** 활동 지표에서 뺀 계정 — 비면 전체 집계(캡션이 제외 여부를 말한다) */
  excludedUserIds: number[]
}

/** BE AdminGroupSummaryResponse — GET /admin/groups 목록 한 행(이름 없음 — CHMO-668) */
export interface AdminGroupRow {
  groupId: number
  /** BE SpaceType(BUSINESS·GENERAL — CHMO-621) 대문자 그대로. 표시명은 format.groupTypeLabel */
  groupType: string
  memberCount: number
  eventCount: number
  photoCount: number
  createdAt: string
  /** 사진이 앨범에 반영된 시각의 최댓값 — 사진이 없으면 null(CHMO-932) */
  lastUploadedAt: string | null
  /** 최근 7일 반영된 사진 수(CHMO-932) */
  last7DaysPhotoCount: number
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
  /**
   * 계정 유형(CHMO-932 — BE A-7). 모임 역할(관리자/멤버)과 **다른 축**이다 — 일반 계정도 비즈니스
   * 모임의 관리자가 되고, 기관 계정도 일반 모임의 멤버가 된다. 구계약 응답은 개인으로 접는다.
   */
  accountType: AdminAccountType
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
  /** 이 이벤트에 사진이 마지막으로 반영된 시각 — 없으면 null(CHMO-932) */
  lastUploadedAt: string | null
}

/**
 * BE BillingScope — 모임 업로드를 무엇으로 판정하나(ADR 039 · CHMO-912): PERSONAL = 활성 모임 패스가
 * 있으면 패스, 없으면 **업로더의 장수** · INSTITUTION = **과금 소유 기관**의 이용 기간(+7일 유예).
 * 모임 생성 때 생성자의 계정 유형으로 스냅샷되고 그 뒤엔 어드민만 바꾼다(감사 이력 남김).
 */
export type AdminBillingScope = 'PERSONAL' | 'INSTITUTION'

/** BE PassPlan — 기간 이용권 플랜(ADR 038 · 1·3·7·30일). 일수는 lib/billing.PASS_PLAN_DAYS */
export type AdminPassPlan = 'DAY_1' | 'DAY_3' | 'DAY_7' | 'DAY_30'

/**
 * BE AdminGroupDetailResponse.Grant — 운영자 패스 지급 원장 한 행(CHMO-932 · ADR 045). 스토어 구매는
 * 별도 원장이라 여기 없다. 회수해도 행은 지워지지 않고 `revokedAt`이 찬다.
 */
export interface AdminPassGrant {
  grantId: number
  /** 미지 값(플랜이 늘어도)은 원문 폴백 — format.passPlanLabel */
  plan: AdminPassPlan | string
  accessFrom: string
  accessUntil: string
  /** 지급한 관리자 userId(닉네임 없음) */
  adminId: number
  memo: string
  createdAt: string
  revokedAt: string | null
  revokedBy: number | null
}

/**
 * BE AdminGroupDetailResponse.Pass — **항상 객체**(패스 행이 없으면 `{active:false, accessUntil:null,
 * grants:[]}`). `accessUntil`은 활성일 때만 값(업로드 권한 조회와 같은 규칙). `grants`는 지급 최신순.
 */
export interface AdminGroupPass {
  active: boolean
  accessUntil: string | null
  grants: AdminPassGrant[]
}

/** BE AdminGroupDetailResponse.Institution — 과금 범위가 INSTITUTION일 때만(과금 소유 기관의 접근 상태) */
export interface AdminGroupInstitution {
  accessStatus: AdminSubscriptionAccessStatus
  accessUntil: string | null
  graceEndsAt: string | null
}

/** BE AdminGroupDetailResponse — GET /admin/groups/:groupId (모임 이름 없음 — CHMO-668) */
export interface AdminGroupDetail {
  groupId: number
  /**
   * BE SpaceType — 상세에도 온다. CHMO-932부터 FE가 읽는다: 멤버 **역할 라벨**(일반 모임은 역할이
   * 없어 전원 '멤버')과 **패스 지급 가능 여부**가 이 값과 과금 범위에 달려 있다. 구계약 생략은 비즈니스.
   */
  groupType: string
  createdAt: string
  /** 생성자 — 탈퇴 등으로 없을 수 있어 null 허용(BE Long) */
  ownerUserId: number | null
  ownerNickname: string | null
  /** ACTIVE 기준(서비스 화면과 같은 규칙) — members 행 수(PENDING 포함)와 다를 수 있다 */
  memberCount: number
  /** 과금 범위(CHMO-932 — BE A-3). 구계약 응답(CHMO-932 전 BE)은 키가 없어 null — 화면은 '—' */
  billingScope: AdminBillingScope | null
  billingOwnerUserId: number | null
  /** 과금 소유자가 탈퇴했으면 null */
  billingOwnerNickname: string | null
  /** 이벤트별 마지막 반영 시각의 최댓값 — 사진이 없으면 null */
  lastUploadedAt: string | null
  pass: AdminGroupPass
  /** 과금 범위가 INSTITUTION일 때만 — 아니면 null */
  institution: AdminGroupInstitution | null
  /** spaceUserId 오름차순(합류·신청 순) */
  members: AdminGroupMember[]
  /** eventId 내림차순(서비스 목록과 동일) */
  events: AdminGroupEvent[]
}

/** BE SpaceType — 목록 `groupType` 필터 값(생략 = 전체). 목록 밖 값은 COMMON400이라 이 유니온만 쓴다 */
export type AdminGroupType = 'BUSINESS' | 'GENERAL'

/**
 * GET /admin/groups 정렬 — 기본 `lastUploadedAt,desc`(CHMO-932 — 운영자가 원하는 기본 순서는 "최근에
 * 사진이 올라온 모임"이다. 사진 없는 모임은 방향과 무관하게 맨 뒤). 집계 정렬(`photoCount`)은
 * CHMO-378의 "1차 제외"가 해제된 것.
 * BE 화이트리스트에는 `name`도 남아 있지만(CHMO-668은 값만 걷고 동작은 유지) **FE는 쓰지 않는다**:
 * 이름을 화면에 안 보여주면 무슨 기준으로 줄 세웠는지 확인할 방법이 없다. 같은 이유로 이름 검색(q)도
 * 보내지 않아 파라미터 자체가 없다. 오름차순 사진 수·오름차순 업로드도 운영에 쓸 일이 없어 뺐다.
 */
export type AdminGroupSort =
  | 'lastUploadedAt,desc'
  | 'photoCount,desc'
  | 'createdAt,desc'
  | 'createdAt,asc'

export interface AdminGroupListParams {
  page: number
  size?: number
  sort?: AdminGroupSort
  /** 생략하면 전체 */
  groupType?: AdminGroupType
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

// ── 이벤트 팝업 (CHMO-928 — BE CHMO-926 PR #312) ────────────────────

/** BE PopupLinkTarget — 앱 안 브라우저 / 외부 브라우저 */
export type AdminPopupLinkTarget = 'IN_APP' | 'EXTERNAL'

/** BE PopupAudience — 판정은 서버가 사용자 accountType으로 한다(모임 역할과 별개) */
export type AdminPopupAudience = 'ALL' | 'ORGANIZATION' | 'PERSONAL'

/** BE PopupHideOption — TODAY면 앱 하단에 [오늘 하루 보지 않기]가 선다 */
export type AdminPopupHideOption = 'TODAY' | 'NONE'

/** BE 팝업 locale(`ko|en|ja` 패턴) — 앱은 Accept-Language 첫 언어로 고른다 */
export type AdminPopupLocale = 'ko' | 'en' | 'ja'

/**
 * BE PopupStatus — 저장값이 아니라 **조회 시각 기준 파생값**이다(OFF가 우선: active=false면
 * 기간과 무관하게 꺼짐). 같은 팝업이 시간이 지나면 SCHEDULED → LIVE → ENDED로 저절로 바뀐다.
 */
export type AdminPopupStatus = 'OFF' | 'SCHEDULED' | 'LIVE' | 'ENDED'

/**
 * 팝업 생성·수정 요청 본문(BE PopupRequest) — **수정도 전체 교체(PUT)**라 같은 형태다.
 * 시각은 오프셋을 실은 ISO-8601(`+09:00`)로 보낸다(BE Instant 바인딩 — 오프셋 없으면 400).
 */
export interface AdminPopupInput {
  /** 관리용 이름 — 앱에 나가지 않는다(100자) */
  title: string
  /** presign으로 받은 서버 발급 키(`popups/{actor}/{uuid}.jpg|png`)만 통과한다 */
  imageKey: string
  /** 화면 읽기 프로그램용 대체 문구(필수 500자) */
  imageAlt: string
  /** 선택(50자) — 없으면 앱에 옐로 버튼이 서지 않는다 */
  ctaLabel: string | null
  /** https만(2048자) */
  linkUrl: string
  linkTarget: AdminPopupLinkTarget
  audience: AdminPopupAudience
  locale: AdminPopupLocale
  startsAt: string
  endsAt: string
  /** 높을수록 먼저 — 앱은 한 번에 하나만 띄운다 */
  priority: number
  hideOption: AdminPopupHideOption
  active: boolean
  /** 선택 — `major.minor.patch` 숫자만 */
  minAppVersion: string | null
}

/**
 * BE AdminPopupResponse — 목록 한 행이자 상세·생성·수정·켜기/끄기 응답 공통 형태
 * (`@JsonUnwrapped content` — 요청 필드가 평면으로 펼쳐져 온다).
 *
 * `imageUrl`은 **presigned GET(2시간)**이라 조회마다 쿼리가 바뀐다. `createdBy`·`updatedBy`는
 * 관리자 userId(닉네임 없음).
 */
export interface AdminPopup extends AdminPopupInput {
  popupId: number
  imageUrl: string
  status: AdminPopupStatus
  createdBy: number
  updatedBy: number
  createdAt: string
  updatedAt: string
}

export interface AdminPopupListParams {
  page: number
  size?: number
  /** 생략하면 전체(삭제분 제외) */
  status?: AdminPopupStatus
}

/** BE PopupImageResponse — 15분 PUT URL. Content-Type·Content-Length가 서명에 들어 있다 */
export interface AdminPopupImageUpload {
  key: string
  uploadUrl: string
  expiresAt: string
}

// ── 혜택 푸시 (CHMO-928 — BE CHMO-926 B절) ──────────────────────────

/**
 * BE CampaignStatus — 즉시 발송은 QUEUED(5초 주기 디스패처가 집는다), 예약은 SCHEDULED로
 * 접수돼 SENDING → SENT/FAILED/PARTIAL/UNKNOWN으로 끝난다. 취소는 SCHEDULED에서만(CANCELLED).
 * **UNKNOWN·FAILED·PARTIAL은 자동 재발송하지 않는다** — 운영자가 확인하고 새로 보낸다.
 */
export type AdminCampaignStatus =
  | 'SCHEDULED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'PARTIAL'
  | 'UNKNOWN'
  | 'CANCELLED'

/** 발송 요청(BE CampaignRequest) — scheduledAt 생략 = 즉시 발송. 모르는 필드는 BE가 400으로 거부 */
export interface AdminCampaignInput {
  /** 입력 그대로 — `(광고)` 접두사는 서버가 붙인다(이미 있으면 중복 안 함) */
  title: string
  /** 입력 그대로 — 전송자·수신 거부 문구는 서버가 끝에 붙인다 */
  body: string
  /** 선택 — https만 */
  link: string | null
}

/**
 * BE CampaignResponse — 생성·테스트·취소·상세·이력 공통 형태(`@JsonInclude(NON_NULL)` — 빈
 * 필드는 키째 생략돼 매퍼가 null로 접는다). title·body는 **자동 문구가 붙은 최종본**이다.
 */
export interface AdminCampaign {
  campaignId: number
  status: AdminCampaignStatus
  title: string
  body: string
  link: string | null
  /** 테스트 발송이면 그 사용자 — 토픽(전체) 발송은 null */
  testUserId: number | null
  /** 예약 시각 — 즉시 발송은 null */
  scheduledAt: string | null
  /** 접수한 관리자 userId(닉네임 없음) */
  createdBy: number
  createdAt: string
  /** SENT·PARTIAL만 값이 있다 */
  sentAt: string | null
  cancelledBy: number | null
  cancelledAt: string | null
  /** FCM이 수락한 메시지 id — 실제 기기 열람을 뜻하지 않는다 */
  fcmMessageIds: string[]
  /** 실패 사유 코드(FCM_NOT_CONFIGURED·OUTSIDE_DELIVERY_HOURS 등) */
  failureCode: string | null
}

/** BE CampaignRecipientsResponse — 현재 버전 MARKETING 동의 ∧ pushEnabled 기준(DB 최신 상태) */
export interface AdminCampaignRecipients {
  /** 기기가 없는 적격 사용자도 센다 */
  userCount: number
  deviceCount: number
}

// ── 사용자·장수·기관 구독 (CHMO-931 — BE CHMO-912) ─────────────────

/** BE AccountType — 가입 때 고른 [개인 | 유치원·기관] 탭(CHMO-808). 기관 계정만 구독 기간을 가진다 */
export type AdminAccountType = 'PERSONAL' | 'ORGANIZATION'

/**
 * 커서 목록 공통(BE `{items, nextCursor, hasNext}`) — 모임 목록의 페이지 봉투(`pageInfo`)와 달리
 * 전체 수가 없다. `nextCursor`는 마지막 행의 id이고 다음 페이지는 그보다 작은 행이다(전부 id DESC).
 */
export interface AdminCursorPage<T> {
  items: T[]
  nextCursor: number | null
  hasNext: boolean
}

export interface AdminCursorParams {
  cursor?: number | null
  /** BE가 1~50으로 접는다(400이 아니다) — 화면은 상수로만 보낸다 */
  size?: number
}

/** BE AdminUserSearchResponse.Item — GET /admin/users */
export interface AdminUserRow {
  userId: number
  nickname: string
  accountType: AdminAccountType
}

export interface AdminUserSearchParams extends AdminCursorParams {
  /** 닉네임 부분 일치(대소문자 무시) 또는 userId 정확 일치. 비면 전체(최근 가입 순) */
  query: string
}

/** BE CreditReason — 미지 값은 원문 표기(format.creditReasonLabel) */
export type AdminCreditReason = 'SIGNUP' | 'MIGRATION' | 'DAILY' | 'UPLOAD' | 'ADMIN_ADJUST'

/**
 * BE CreditLedgerResponse.Item — 장부 한 줄. 모임·이벤트는 **이름만 지금 값**이고(스냅샷을 저장하지
 * 않는다) 지워졌으면 이름이 null이다. 운영자 조정(ADMIN_ADJUST)만 memo가 있다.
 */
export interface AdminCreditLedgerItem {
  ledgerId: number
  delta: number
  balanceAfter: number
  reason: AdminCreditReason | string
  groupId: number | null
  groupName: string | null
  eventId: number | null
  eventName: string | null
  memo: string | null
  createdAt: string
}

/** BE AdminUserCreditsResponse — GET /admin/users/{id}/credits. 장부는 커서 페이지 */
export interface AdminUserCredits {
  userId: number
  balance: number
  ledger: AdminCursorPage<AdminCreditLedgerItem>
}

/** BE AdminCreditAdjustmentRequest — 지급은 양수·회수는 음수(0은 VALID400), 메모 필수 500자 */
export interface AdminCreditAdjustmentInput {
  delta: number
  memo: string
}

/** BE AdminCreditAdjustmentResponse — POST credit-adjustments(201). `balance`는 조정 뒤 잔액 */
export interface AdminCreditAdjustment {
  userId: number
  delta: number
  balance: number
}

/**
 * BE SubscriptionAccessStatus — 기관 이용 상태. ACTIVE = 살아 있는 기간 안 · GRACE = 종료 후 7일
 * 유예(업로드 가능) · BLOCKED = 유예도 끝났거나 기간이 한 번도 없음(새 업로드 BILLING403).
 */
export type AdminSubscriptionAccessStatus = 'ACTIVE' | 'GRACE' | 'BLOCKED'

/** BE AdminOrganizationSubscriptionListResponse.Item — 구독 행이 있는 기관만 온다 */
export interface AdminOrganizationSubscriptionRow {
  subscriptionId: number
  userId: number
  /** 계정이 지워졌으면 null */
  nickname: string | null
  status: AdminSubscriptionAccessStatus
  /** 기간이 한 번도 없으면 null */
  accessUntil: string | null
  graceEndsAt: string | null
}

/**
 * BE AdminOrganizationSubscriptionPeriodRequest — 시각은 Instant(오프셋 ISO), `paidOn`은 날짜.
 * 등록기가 `accessUntil > accessFrom`과 기관 계정 여부를 검사한다(둘 다 VALID400).
 */
export interface AdminSubscriptionPeriodInput {
  accessFrom: string
  accessUntil: string
  amountKrw: number
  paidOn: string
  payerName: string
  invoiceNo: string | null
  memo: string | null
}

/** BE AdminOrganizationSubscriptionResponse.Period — 무효화된 기간은 `voidedAt`이 찬다 */
export interface AdminSubscriptionPeriod {
  periodId: number
  accessFrom: string
  accessUntil: string
  amountKrw: number
  paidOn: string
  payerName: string
  invoiceNo: string | null
  memo: string | null
  voidedAt: string | null
}

/**
 * BE AdminOrganizationSubscriptionResponse — 기간 등록(201)·무효화(200)의 응답. 그 기간 한 건과
 * **처리 직후의 접근 상태**를 함께 준다. 무효화 응답은 nickname이 null이다(BE가 유저를 다시 안 읽는다).
 */
export interface AdminOrganizationSubscription {
  organizationUserId: number
  nickname: string | null
  accessStatus: AdminSubscriptionAccessStatus
  accessUntil: string | null
  graceEndsAt: string | null
  period: AdminSubscriptionPeriod
}

// ── 어드민 조회 확장·패스 지급·과금 범위 (CHMO-932 — BE PR #317) ────────────

/**
 * BE AdminBillingScopeRequest — `PUT /admin/groups/{id}/billing-scope`. 소유자는 userId로 지정하고
 * 기관 범위면 **기관 계정**이어야 한다(VALID400 "기관 과금 범위의 소유자는 기관 계정이어야 합니다.").
 * 메모 필수 500자 — 감사 이력(`space_billing_scope_history`)에 그대로 남는다.
 */
export interface AdminBillingScopeInput {
  billingScope: AdminBillingScope
  billingOwnerUserId: number
  memo: string
}

/** BE AdminBillingScopeResponse — 바뀐 뒤 값 */
export interface AdminBillingScopeResult {
  groupId: number
  billingScope: AdminBillingScope
  billingOwnerUserId: number
}

/** BE AdminPassGrantRequest — 메모 규칙은 장수 조정과 같다(필수 500자) */
export interface AdminPassGrantInput {
  plan: AdminPassPlan
  memo: string
}

/**
 * BE AdminPassGrantResponse(201) — `accessFrom`은 살아 있는 패스가 있으면 **그 만료 시각**(스토어 구매와
 * 같은 누적 규칙, ADR 038), 없으면 지금. 재요청(같은 Idempotency-Key)은 처음 결과를 다시 준다.
 */
export interface AdminPassGrantResult {
  grantId: number
  groupId: number
  plan: AdminPassPlan | string
  accessFrom: string
  accessUntil: string
}

/** BE AdminPassGrantRevokeResponse — `passAccessUntil`은 회수 뒤 모임 패스 만료(패스 행이 없으면 null) */
export interface AdminPassGrantRevokeResult {
  grantId: number
  groupId: number
  revokedAt: string
  passAccessUntil: string | null
}

/**
 * BE SubscriptionPeriodKind — 저장 컬럼 없이 **등록 관리자 유무로 파생**한다: TRIAL = 가입 체험
 * (CHMO-940 — 기관 계정이 생길 때 서버가 14일을 넣는다, adminId null) · ADMIN = 운영자 등록.
 */
export type AdminSubscriptionPeriodKind = 'TRIAL' | 'ADMIN'

/** BE AdminOrganizationSubscriptionHistoryResponse.Period — 등록 응답의 기간에 출처·감사 필드를 더한 것 */
export interface AdminSubscriptionHistoryPeriod extends AdminSubscriptionPeriod {
  kind: AdminSubscriptionPeriodKind | string
  /** 가입 체험은 null */
  adminId: number | null
  createdAt: string
  voidedBy: number | null
}

/**
 * BE AdminOrganizationSubscriptionHistoryResponse — `GET /admin/organizations/{userId}/subscription`.
 * 무효화분 포함 등록 최신순. **구독 행이 없는 기관은 404가 아니라 `periods: []` + BLOCKED**(기간을
 * 아직 못 받은 기관도 정상 상태다). 없는 사용자 USER404 · 기관 계정 아님 VALID400.
 */
export interface AdminOrganizationSubscriptionHistory {
  userId: number
  nickname: string
  accountType: AdminAccountType
  accessStatus: AdminSubscriptionAccessStatus
  accessUntil: string | null
  graceEndsAt: string | null
  periods: AdminSubscriptionHistoryPeriod[]
}

/** BE AdminUserSummaryResponse.Group — 속한 모임(승인 대기 포함 · 멤버십 id 순). 모임 이름 없음(CHMO-668) */
export interface AdminUserGroupMembership {
  groupId: number
  groupType: string
  role: AdminMemberRole | string
  status: AdminMemberStatus | string
}

/**
 * BE AdminUserSummaryResponse — `GET /admin/users/{userId}`. 사용자 상세의 머리(종전엔 검색 API를
 * `query=<id>`로 다시 불러 우회했다 — CHMO-931). PIN 계정은 `socialProviders: []`.
 */
export interface AdminUserSummary {
  userId: number
  nickname: string
  accountType: AdminAccountType
  /** BE UserRole(USER·ADMIN) — 어드민 권한이지 서비스 권한이 아니다 */
  role: string
  createdAt: string
  socialProviders: string[]
  groups: AdminUserGroupMembership[]
}
