/**
 * API 계약 타입 (docs/api-spec.md §2 리소스 스키마).
 * 화면은 이 타입만 본다 — 서버 응답 형태(봉투·BE 필드명)는 src/api/ 엔드포인트 계층이
 * 흡수해 이 타입으로 변환한다(CHMO-192). MSW 목도 같은 형태로 응답한다(CHMO-195).
 */

/** 리소스 식별자 — BE는 전부 int64 숫자 id (CHMO-191) */
export type ID = number
/** ISO 8601 (예: 2026-06-27T09:41:00+09:00) */
export type ISODateTime = string
/** YYYY-MM-DD */
export type ISODate = string

// ── User (제작자) ────────────────────────────────────────────
export interface User {
  id: ID
  nickname: string
  createdAt: ISODateTime
}

// ── Group (모임) ─────────────────────────────────────────────
export interface GroupShare {
  token: string
  url: string
  hasPassword: boolean
}

// 학부모 전환(CHMO-444 · docs/parent-model-api-draft.md) — role은 모임 멤버십 단위(user×group).
// 계정 유형은 나누지 않고, 어느 초대 링크(joinKey 2종)로 합류했는지가 role을 정한다(Q6).
// 값은 BE 직렬화 값 EDITOR/VIEWER의 소문자 정규화(CHMO-604 — 구 TEACHER/PARENT, ADR 021).
// editor = 편집 전권(구 선생님) · viewer = 열람 전용(구 학부모). 화면 라벨(선생님/학부모)은 별개다.
export type GroupRole = 'editor' | 'viewer'

/**
 * 모임 유형(BE CHMO-599 · ADR 020) — 생성 시 지정, 이후 변경 불가.
 * business = 역할 분리·승인제·검수/공개·아동 보호자 동의 가드가 있는 사업자용(구 유치원).
 * general = 전원 editor(역할 분리 없음) — 학부모 키 합류가 닫히고 presign 동의 게이트가 없다.
 * 유형 도입 전 응답(구계약)은 매퍼가 business로 정규화한다(BE 백필과 같은 의미).
 */
export type GroupType = 'business' | 'general'
/** 합류는 역할 무관 승인제(§1) — 신청(pending) 후 선생님 승인으로 active */
export type MembershipStatus = 'pending' | 'active'

/** 모임 목록 항목의 내 멤버십(§7-2) — PENDING 사용자는 이 값 하나로 끝(다른 모임 API 미호출) */
export interface MyMembership {
  role: GroupRole
  status: MembershipStatus
  /** 학부모 신청 원문(자유 텍스트) — 홈 카드 "신청: 김민준" 표기용. 선생님은 빈 배열 */
  claimedChildNames: string[]
  /**
   * 승인 후 선생님이 연결(§4 매핑)한 인물 이름 — 18·19 헤더 "학부모 · {자녀명}" 원천.
   * 매핑 조회(/members)가 TEACHER 전용이라 학부모 화면은 이 값으로만 연결 이름을 안다.
   * CHMO-448 초안 확장(BE 미협의 제안) — 미연결·선생님은 빈 배열.
   */
  linkedChildNames: string[]
}

export interface Group {
  id: ID
  name: string
  /** 모임 유형(목록·상세·생성·이름변경 응답 전부 포함 — 구계약 생략은 매퍼가 business 정규화) */
  groupType: GroupType
  /** 내 멤버십(role·승인 상태) — 실 BE 미배포 응답엔 없어 undefined(기존 제작자 동작 유지) */
  myMembership?: MyMembership
  /** ACTIVE 멤버 수 — VIEWER·PENDING 응답엔 멤버 정보가 없다(§7-3 미노출) */
  memberCount?: number
  /** 상세 카운트 분리(§7-3 — "선생님 3 · 학부모 12") — memberCount는 과도기 병행. CHMO-605 개명 */
  editorCount?: number
  viewerCount?: number
  /** BE 상세(GroupDetailResponse)엔 없음 — 상세 화면은 이벤트 목록 길이로 파생(CHMO-192) */
  eventCount?: number
  createdAt: ISODateTime
}

/** POST /groups/join — 즉시 합류가 아니라 신청(PENDING) 생성이다(§1 승인제) */
export interface JoinGroupResult {
  groupId: ID
  groupName: string
  role: GroupRole
  status: MembershipStatus
}

// ── 초대 (TEACHER 전용 — Q3 · 평문 비밀번호 포함) ────────────
export interface GroupInviteChannel {
  joinKey: string
  /** 합류 비밀번호 평문 — 선생님은 모임 비밀번호, 학부모는 기존 sharePassword 재사용(Q2) */
  password: string
  joinUrl: string
}

/**
 * 초대 정보 2종(Q6 — 링크가 role을 정한다).
 * parent는 **구계약 공존 구간엔 null** — 현재 배포된 실 BE는 선생님 채널(평면 응답)만 준다.
 * 소비 화면은 null이면 학부모 초대 UI를 숨긴다(BE 초안 배포 후 non-null 보장되면 좁힌다).
 */
export interface GroupInviteInfo {
  teacher: GroupInviteChannel
  parent: GroupInviteChannel | null
}

export interface GroupShareInfo extends GroupShare {
  /** 학부모 전용 비밀번호(모임 비밀번호와 별개) — 공유 화면 전용 노출 */
  password: string
}

// ── 합류 신청·멤버·인물 매핑 (TEACHER 전용 — §2·§4) ──────────
export interface JoinRequest {
  id: ID
  userId: ID
  nickname: string
  role: GroupRole
  /** 학부모 신청 원문 — 승인 후 연결할 때 선생님이 참조(연결 전까지 보존) */
  childNames: string[]
  createdAt: ISODateTime
}

export interface PersonMapping {
  personId: ID
  /** 인물 이름 — 이름 없는 인물이면 null(표시 폴백은 화면 소유) */
  personName: string | null
}

export interface GroupMember {
  userId: ID
  nickname: string
  role: GroupRole
  /** 신청 원문(학부모) — 선생님은 빈 배열 */
  childNames: string[]
  /** 학부모↔인물 매핑(다대다 — 다자녀·부모 2인 허용). 미연결 = 빈 배열(별도 상태 없음, §2) */
  mappings: PersonMapping[]
}

/**
 * 모임 인물(20-1 아이 연결 후보 — FE 파생, CHMO-447). 그룹 단위 인물 조회 엔드포인트가
 * 계약 초안에 없어 이벤트별 앨범 목록에서 파생한다(listGroupPersons — photoCount는 전 이벤트 합산).
 */
export interface GroupPerson {
  personId: ID
  name: string
  photoCount: number
  coverThumbnailUrl: string | null
}

// ── 학부모 사진 조회 (ACTIVE PARENT 전용 — §5, 뷰어 로직 이관) ──
export interface ParentPhoto {
  id: ID
  url: string
  thumbnailUrl: string
  downloadUrl: string
}

/** GET /events/:id/parent-photos — 매핑된 인물 + 공통, published만, 플랫(앨범 계층 없음) */
export interface ParentEventPhotos {
  eventId: ID
  eventName: string
  photos: ParentPhoto[]
}

// ── Event (이벤트) ───────────────────────────────────────────
export type EventStatus = 'empty' | 'analyzing' | 'review' | 'ready' | 'published'

export interface EventItem {
  id: ID
  groupId?: ID
  name: string
  date: ISODate
  status: EventStatus
  photoCount: number
  albumCount: number
  createdAt?: ISODateTime
  publishedAt?: ISODateTime | null
  /** 뷰어 목록에서 커버 썸네일 */
  coverPhotoId?: ID | null
  /**
   * 커버 사진 썸네일 URL — **목록 응답에만** 있다(상세엔 thumbnailUrl이 없다. ViewerEvent 선례와 같은 필드).
   * 05 이벤트 카드 커버용(CHMO-515) — 사진이 없는 이벤트는 서버가 null을 준다.
   */
  coverThumbnailUrl?: string | null
  /**
   * AI 분석 진행률(CHMO-287) — **상세 응답에만** 있고 목록엔 없다.
   * 분석 job 진행 중에만 non-null(완료 직후 잠시 100을 유지하다 null로 돌아간다 — 실서버 관찰).
   */
  progress?: AnalysisProgress | null
  /**
   * 발행 대기 수(구 재공개 게이트 CHMO-324·265) — 검토됐지만 아직 발행되지 않은 사진.
   * **상세 응답에만** 있고 목록엔 없다.
   * ⚠ **화면은 더 이상 읽지 않는다**(CHMO-488): 전량 검토 완료가 공개의 하드 게이트가 되고
   * 이벤트당 업로드도 1회(CHMO-486)라 공개 후에 발행 대기가 생길 경로가 사라졌다.
   * BE(CHMO-487)가 필드를 걷어낼 때까지는 실 BE 응답 그대로 통과시킨다.
   */
  pendingPublishCount?: number
}

/** AI 분석 진행률 — GET /events/:id의 `progress`(BE가 percent까지 계산해 준다) */
export interface AnalysisProgress {
  processed: number
  total: number
  percent: number
}

// ── 분석 상태 ────────────────────────────────────────────────
/** BE `AnalysisStatusResponse.AnalysisStatus` — 이벤트 상태에서 유도한 값(진행률·폴링 없음) */
export type AnalysisStatus = 'none' | 'analyzing' | 'done'

/**
 * GET /events/:id/analysis — 분석 상태 확인.
 * 분석 **실패**는 BE에 표현이 없다(이벤트를 EMPTY로 되돌려 `none`과 구분 불가 — CHMO-218).
 */
export interface AnalysisJob {
  analysisStatus: AnalysisStatus
  eventStatus: EventStatus
}

// ── Album (앨범) ─────────────────────────────────────────────
export type AlbumType = 'person' | 'common' | 'uncertain' | 'eyes_closed' | 'blurry'

export interface Album {
  id: ID
  type: AlbumType
  /** 인물 앨범만 값 보유(모임 단위 인물 식별자), 그 외 null */
  personId: ID | null
  name: string
  photoCount: number
  /** 앨범 내 미검토 사진 수(파생값) — 앨범 상세 응답엔 없다(목록 전용) */
  unreviewedPhotoCount?: number
  coverPhotoId: ID | null
  /** 커버 사진 썸네일 URL(파생값 — coverPhotoId 없으면 null). 08 앨범 그리드 카드 커버용 */
  coverThumbnailUrl?: string | null
  /** 학부모 뷰어 노출 여부(person/common만 true — 서버는 주지 않는다, type에서 파생) */
  visibleToViewer?: boolean
}

// ── Photo (사진) ─────────────────────────────────────────────
export interface PhotoFlags {
  eyesClosed: boolean
  blurry: boolean
}

/** '분류가 어려워요' 사진에서 분류를 어렵게 한(애매한) 얼굴 하나의 bbox — 원본 이미지 px, 좌상단 x·y (CHMO-412) */
export interface FaceBbox {
  x: number
  y: number
  w: number
  h: number
}

export interface Photo {
  id: ID
  /** 앨범과 다대다 — 여러 앨범에 속할 수 있음 */
  albumIds: ID[]
  /** 원본 URL — 서버엔 downloadUrl뿐이라 같은 값이다(치수는 주지 않는다) */
  url: string
  thumbnailUrl: string
  flags?: PhotoFlags
  /** 검토 여부(사진 단위) — 미검토 사진은 뷰어 응답에서 제외 */
  reviewed: boolean
  downloadUrl?: string
  /** 분류를 어렵게 한 얼굴들의 bbox — uncertain으로 분류된 사진에만 값이 있다(그 외 빈 배열, CHMO-412) */
  faceBboxes: FaceBbox[]
  /** 분류가 어려웠던 이유 코드(AI 고정 계약) — 문구 변환은 lib/uncertainCauses.ts가 소유 */
  causes: string[]
}

// ── 인증 응답 ────────────────────────────────────────────────
/**
 * BE AuthResponse엔 user 객체가 없다(userId·nickname·accessToken·refreshToken 평면 필드).
 * 두 토큰에 더해 `userId`만 남긴다 — 온보딩 1회 노출 판정(CHMO-481)이 "누구의 기기인가"를
 * 알아야 하는데, 로그인 응답 말고는 계정 식별자를 알 수 있는 지점이 `GET /me`뿐이라
 * (온보딩은 서버 호출 없는 화면) 여기서 받아 저장한다. nickname은 쓰는 화면이 없어 계속 버린다.
 * accessToken(만료 1시간) 401 시 refreshToken으로 자동 재발급한다(CHMO-193, client.ts).
 */
export interface AuthResponse {
  userId: ID
  accessToken: string
  refreshToken: string
}

// ── 약관 동의 (CHMO-516 · BE CHMO-514) ───────────────────────
/**
 * 동의 항목 — BE `AgreementType`(대문자)을 소문자로 정규화한 값(role·album type 선례).
 * 문구 전문은 BE에 없다: 정본은 `docs/legal/`·`src/legal/`이고 BE는 항목별 **현재 유효 버전만**
 * 소유해 FE가 제출한 버전을 검증한다(카탈로그 테이블 없음).
 */
export type AgreementType =
  | 'age_14_over'
  | 'terms_of_service'
  | 'privacy_policy'
  | 'face_data'
  | 'marketing'
  /** 아동 보호자 동의 확보 확인 — 회원이 아니라 **모임** 단위(선생님별로 쌓인다) */
  | 'child_consent_attested'
  /**
   * 자녀의 사진·얼굴 특징정보 처리 동의 — 동의권자(보호자) **본인**이 학부모 합류 신청에
   * 남기는 기록(모임 단위, BE CHMO-586). 선생님의 확인(child_consent_attested)과 주체가 다르다.
   * 수집 경로가 POST /agreements가 아니라 합류 신청 body(childConsentVersion)라는 점도 다르다.
   */
  | 'guardian_child_consent'

/** 동의의 적용 범위 — user는 계정 1회, group은 모임마다 */
export type AgreementScope = 'user' | 'group'

export interface AgreementStatus {
  type: AgreementType
  currentVersion: string
  required: boolean
  scope: AgreementScope
  /**
   * "현재 버전에 동의한 상태인가" — 구버전에만 동의했으면 false(재동의 대상).
   * ⚠ `scope === 'group'` 항목은 모임별이라 **항상 false**로 온다(어느 모임인지 모르는 응답).
   * 가입 게이트를 required && !agreed로 계산할 땐 user 스코프만 봐야 한다(CHMO-479).
   */
  agreed: boolean
}

/** POST /agreements 제출 항목 — version은 **화면에 실제로 보여준 버전**을 싣는다 */
export interface AgreementSubmission {
  type: AgreementType
  version: string
  agreed: boolean
}

// ── 업로드 3단계 (presign → S3 PUT → 등록) ───────────────────
/** BE는 contentType을 `fileName` 확장자로 유도한다 — 요청에 담지 않는다 */
export interface PresignFileRequest {
  fileName: string
  size: number
}

export interface PresignUpload {
  /** 등록(POST /events/:id/photos) 때 되돌려 보낼 업로드 키 */
  s3Key: string
  uploadUrl: string
  /** S3 서명에 묶인 값 — PUT의 Content-Type 헤더가 이것과 정확히 같아야 서명이 맞는다 */
  contentType: string
}

/** POST /events/:id/photos — 등록이 곧 분석 시작이라 품질 제외 옵션을 함께 보낸다 */
export interface RegisterPhotosRequest {
  s3Keys: string[]
  excludeEyesClosed: boolean
  excludeBlurry: boolean
}

export interface RegisterPhotosResult {
  jobId: string
  registeredCount: number
}

// ── 공개 요약(14) ────────────────────────────────────────────
export interface ReviewSummary {
  /**
   * 이벤트 **전체** 사진 수(BE totalPhotos) — 공개될 장수가 아니다(특수 앨범 사진 포함).
   * 14는 이걸 '전체 사진'으로 라벨해 범위를 드러낸다. 정확한 발행 장수는 사진이 앨범과 다대다라
   * 앨범별 photoCount 합으로 셀 수 없다(겹친 사진 중복) — BE `publishablePhotoCount`(CHMO-505) 배포 후 전환.
   * `albumCount`(BE totalAlbums)는 걷어냈다 — 14가 '공개할 앨범'(previewAlbums)만 보여주기 때문(CHMO-488).
   */
  photoCount: number
  /**
   * 검토 진척은 앨범 단위로 보여준다(CHMO-357) — 검토 행위가 앨범 일괄뿐이라
   * 사진 수 정산은 선생님의 머릿속 진척("앨범 2/3 끝냄")과 어긋난다(피드백 #17).
   * 집계는 학부모에게 보일 인물·공통(사진 보유)만 — 특수 앨범 검토는 공개 결과와 무관.
   */
  reviewedAlbumCount: number
  reviewableAlbumCount: number
  /**
   * 공개를 막는 앨범(파생값 — CHMO-488): 인물·공통 중 미검토 사진이 남은 것.
   * 전량 검토 완료가 공개의 하드 게이트라 이 배열이 비어야 [공개하기]가 열린다.
   * 14가 앨범명·남은 장수로 "무엇을 더 검토해야 하는지"를 안내하는 데 쓴다.
   */
  unreviewedAlbums: Album[]
  /**
   * 학부모 뷰 프리뷰용 앨범(파생값 — BE albums[]에 뷰어 노출 규칙 적용).
   * **전 사진 검토 완료된** person/common 앨범 = 발행 대상과 같은 집합(CHMO-488 — `reviewedAlbumCount`가
   * 세는 것과 동일하다). 검수하다 만 앨범은 검토분까지 통째로 대기해 공개해도 나가지 않으므로 제외한다.
   * 14 미리보기가 08과 같은 앨범 카드로 그린다(CHMO-346).
   */
  previewAlbums: Album[]
  /**
   * 공개되지 않는 앨범(파생값 — CHMO-521): 사진이 있는 분류가 어려워요·눈감음·흔들림.
   * 검토 UI가 없어(CHMO-357) 검토 동선에 한 번도 등장하지 않는데 학부모에게도 나가지 않으므로,
   * 검토를 다 끝내고 온 14에서 "저 사진들은 어떻게 되나"에 한 줄로 답한다.
   * 카드로는 보여주지 않는다(CHMO-347 — 미리보기는 공개 대상만).
   */
  excludedAlbums: Album[]
}

// ── 이동 추천 ────────────────────────────────────────────────
export interface MoveSuggestion {
  albumId: ID
  name: string
  /** 공통 사진첩 여부 — BE type(PERSON/COMMON)에서 파생. similarity 유무로 판정하지 않는다(CHMO-399) */
  isCommon: boolean
  /**
   * 대표 벡터 기반 유사도(0~1) — **실 BE가 더는 보내지 않아 사실상 항상 null**이고
   * 화면도 표시하지 않는다(2026-07-29). 추천 목록의 **순서**가 유사도를 대신한다.
   */
  similarity: number | null
  /** 대표 사진 썸네일 URL(CHMO-232) — 커버 없는 앨범은 null(플레이스홀더 폴백) */
  thumbnailUrl: string | null
}

// ── 사진 이동/제거 (다대다 연결 교체·해제) ───────────────────
export interface MovePhotosResponse {
  movedCount: number
}

/**
 * BE DeletePhotosResponse 형태(CHMO-192) — 다대다에서 "연결만 해제"(detached)와
 * "마지막 연결이라 완전 삭제"(deleted)를 구분해 준다.
 */
export interface DeletePhotosResponse {
  detachedCount: number
  deletedPhotoCount: number
}

// ── 뷰어(학부모 무로그인) ────────────────────────────────────
// 뷰어 응답은 서버 필터링 결과만 담는다: published 이벤트 · person/common 앨범 ·
// 검토 완료(reviewed) 사진. 카운트/커버도 필터링된 사진 기준 파생값.
/** BE UnlockViewerResponse 형태(CHMO-192) — 모임명은 뷰어 화면들이 캐시해 쓴다(lib/viewer.ts) */
export interface ViewerUnlockResponse {
  viewerToken: string
  groupId: ID
  groupName: string
}

export interface ViewerEvent {
  id: ID
  name: string
  date: ISODate
  photoCount: number
  albumCount: number
  coverPhotoId: ID | null
  /** 커버 사진 썸네일 URL(파생값 — Album.coverThumbnailUrl 선례, 커버 없으면 null). 15-L 카드 커버용 */
  coverThumbnailUrl: string | null
  publishedAt: ISODateTime | null
}

export interface ViewerAlbum {
  id: ID
  type: AlbumType
  name: string
  photoCount: number
  coverPhotoId: ID | null
  /** 커버 사진 썸네일 URL(파생값 — 커버 없으면 null). 15 앨범 카드 커버용 */
  coverThumbnailUrl: string | null
}

export interface ViewerPhoto {
  id: ID
  url: string
  thumbnailUrl: string
  downloadUrl: string
}

export interface AlbumDownloadResponse {
  downloadUrl: string
  expiresAt: ISODateTime
}
