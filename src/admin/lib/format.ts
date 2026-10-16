/**
 * 어드민 표시 포맷·표시명 단일 원천 (CHMO-379).
 * 값이 비면 전부 '—'로 수렴한다 — 표에서 빈 칸은 "안 불렀나"로 읽히고 대시는 "없다"로 읽힌다.
 */
import type { AdminMemberStatus } from '../api/types'
import { PASS_PLAN_DAYS } from './billing'

/**
 * 모임 표시명 — 어드민 응답엔 모임 이름이 없다(BE CHMO-668). 표 첫 칸·상세 제목·브레드크럼이
 * 전부 이 한 형태(`모임 #45`)를 쓴다: 행을 짚어 말할 단서이자 상세 URL의 그 값이다.
 */
export function groupLabel(groupId: number | string): string {
  return `모임 #${groupId}`
}

/** 천 단위 구분(1,284) — 어드민 숫자 표기 공통 */
export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR')
}

/** ISO 시각/날짜 → KST 날짜(YYYY-MM-DD). eventDate 같은 날짜 문자열도 그대로 받는다 */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  // sv-SE 로케일이 ISO 형태(YYYY-MM-DD)를 낸다 — 수동 조립보다 타임존 처리가 안전
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

/** ISO 시각 → KST 날짜+시각(YYYY-MM-DD HH:mm) — 대시보드 '마지막 갱신' 등 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const time = date.toLocaleTimeString('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${day} ${time}`
}

// ── BE enum 표시명 — 어드민은 BE 상태를 그대로 보여준다(서비스 화면 파생과 별개) ──

/** BE MomentStatus → 배지 라벨·색 토큰 키(tailwind admin.status.*) */
const EVENT_STATUS_BADGES: Record<string, { label: string; token: string }> = {
  EMPTY: { label: '빈 이벤트', token: 'empty' },
  ANALYZING: { label: '분석중', token: 'analyzing' },
  REVIEW: { label: '검수중', token: 'review' },
  READY: { label: '공개 준비', token: 'ready' },
  PUBLISHED: { label: '공개', token: 'published' },
}

/** 미지의 상태는 원문 그대로 중립 표기 — BE에 상태가 늘어도 화면이 깨지지 않는다 */
export function eventStatusBadge(status: string): { label: string; token: string } {
  return EVENT_STATUS_BADGES[status] ?? { label: status, token: 'empty' }
}

/**
 * 모임 역할 → 앱 워딩(**관리자/멤버** — CHMO-608~610 이후 서비스 화면의 말). 종전 '선생님/학부모'는
 * 유치원 어휘라 일반 모임에서 거짓이었고, 무엇보다 **일반 모임은 역할이 없다**(전원 EDITOR — ADR 020):
 * 유형을 모르고 EDITOR를 적으면 일반 모임 멤버 전원이 '선생님'(이제는 '관리자')으로 보인다(CHMO-932 —
 * "다 선생님으로 보인다"의 원인). 그래서 모임 유형이 두 번째 인자다 — 일반이면 역할과 무관하게 '멤버'.
 * 신·구 직렬화 값을 함께 받는다(CHMO-605 리네이밍) · 미지 값은 원문 중립 표기라 string으로 연다.
 */
export function memberRoleLabel(role: string, groupType = 'BUSINESS'): string {
  if (groupType === 'GENERAL') return '멤버'
  if (role === 'EDITOR' || role === 'TEACHER') return '관리자'
  if (role === 'VIEWER' || role === 'PARENT') return '멤버'
  return role
}

export function memberStatusLabel(status: AdminMemberStatus): string {
  if (status === 'ACTIVE') return '참여 중'
  if (status === 'PENDING') return '승인 대기'
  return status
}

// ── 기관 도입 문의 (CHMO-811) ─────────────────────────────────────

/**
 * BE OrganizationInquiryStatus → 배지 라벨·색 토큰.
 * **새 색을 만들지 않고 이벤트 배지 토큰을 다시 쓴다** — 뜻이 겹치는 자리에 색을 늘리면
 * 같은 화면에서 색이 의미를 잃는다: 접수됨=손대야 할 일(주황) · 연락 완료=진행 중(갈색) ·
 * 개통=끝난 일(초록) · 종료=더는 안 보는 일(회색).
 */
const INQUIRY_STATUS_BADGES: Record<string, { label: string; token: string }> = {
  RECEIVED: { label: '접수됨', token: 'analyzing' },
  CONTACTED: { label: '연락 완료', token: 'ready' },
  ONBOARDED: { label: '개통', token: 'published' },
  CLOSED: { label: '종료', token: 'empty' },
}

/** 미지의 상태는 원문 중립 표기(eventStatusBadge와 같은 결) */
export function inquiryStatusBadge(status: string): { label: string; token: string } {
  return INQUIRY_STATUS_BADGES[status] ?? { label: status, token: 'empty' }
}

/** 상태 라벨만 — 액션 버튼·확인 문구·토스트가 배지와 같은 말을 쓴다 */
export function inquiryStatusLabel(status: string): string {
  return inquiryStatusBadge(status).label
}

/** BE OrganizationType */
export function organizationTypeLabel(type: string): string {
  if (type === 'KINDERGARTEN') return '유치원'
  if (type === 'DAYCARE') return '어린이집'
  if (type === 'ACADEMY') return '학원'
  if (type === 'OTHER') return '기타'
  return type
}

/** BE ContactRole — 선택 항목이라 null이면 '—'(값이 비면 대시로 수렴하는 규칙) */
export function contactRoleLabel(role: string | null): string {
  if (!role) return '—'
  if (role === 'DIRECTOR') return '원장님'
  if (role === 'TEACHER') return '선생님'
  if (role === 'STAFF') return '행정'
  return role
}

/**
 * 소셜 로그인 수단 — 빈 배열은 소셜 계정이 없다는 뜻이라 'PIN'이 맞다('—'가 아니다:
 * 로그인 수단이 없는 계정은 없고, 운영자가 "어떻게 로그인하는 사람인가"를 읽는 칸이다).
 */
export function socialProvidersLabel(providers: string[]): string {
  if (providers.length === 0) return 'PIN'
  return providers.map(socialProviderLabel).join(' · ')
}

function socialProviderLabel(provider: string): string {
  if (provider === 'KAKAO') return '카카오'
  if (provider === 'NAVER') return '네이버'
  if (provider === 'GOOGLE') return '구글'
  if (provider === 'APPLE') return '애플'
  return provider
}

/**
 * 연락처 표시 — 하이픈 없는 숫자열을 끊어 읽기 쉽게(`010-1234-5678`).
 * 형식이 다르면(국번 2자리·대표번호 등) 손대지 않고 원문 그대로 둔다 — 운영자가 전화를 거는
 * 값이라 추측해서 끊는 것보다 그대로 보여주는 편이 안전하다. `tel:` href는 원문을 쓴다.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return phone
}

// ── 신고·문의 (CHMO-862) ──────────────────────────────────────────

/**
 * BE ReportType → 표시명. 앱 폼 라벨('사진 분류가 이상해요' 같은 문장형)이 아니라 표 칸에 맞는
 * 짧은 이름이고, 유형 필터 칩과 배지가 같은 말을 쓴다.
 */
const REPORT_TYPE_LABELS: Record<string, string> = {
  APP_ERROR: '앱 오류',
  CLASSIFICATION: '사진 분류',
  ACCOUNT: '계정·참여',
  OTHER: '제안·기타',
  DELETION_REQUEST: '삭제 요청',
  INAPPROPRIATE: '부적절 신고',
}

/** 미지 유형은 원문 그대로(어드민 공통 폴백) */
export function reportTypeLabel(type: string): string {
  return REPORT_TYPE_LABELS[type] ?? type
}

/**
 * 신고 2종(사진·사람에 대한 조치 요청)인가 — BE `ReportType.isReport()`와 같은 경계.
 * 이 둘만 붉은 배지로 띄워 목록에서 먼저 눈에 걸리게 한다(나머지 넷은 문의라 중립 회색).
 */
export function isReportType(type: string): boolean {
  return type === 'DELETION_REQUEST' || type === 'INAPPROPRIATE'
}

/** 유형 배지 — 신고는 `report`(붉은색), 문의는 중립 회색 토큰 */
export function reportTypeBadge(type: string): { label: string; token: string } {
  return { label: reportTypeLabel(type), token: isReportType(type) ? 'report' : 'review' }
}

/**
 * BE ReportStatus → 배지. 기관 문의와 같은 원칙으로 **새 색을 만들지 않는다**:
 * 접수됨=손대야 할 일(주황) · 확인 중=진행 중(갈색) · 답변 완료=끝난 일(초록) · 종료=더는 안 보는 일(회색).
 */
const REPORT_STATUS_BADGES: Record<string, { label: string; token: string }> = {
  RECEIVED: { label: '접수됨', token: 'analyzing' },
  IN_PROGRESS: { label: '확인 중', token: 'ready' },
  ANSWERED: { label: '답변 완료', token: 'published' },
  CLOSED: { label: '종료', token: 'empty' },
}

export function reportStatusBadge(status: string): { label: string; token: string } {
  return REPORT_STATUS_BADGES[status] ?? { label: status, token: 'empty' }
}

export function reportStatusLabel(status: string): string {
  return reportStatusBadge(status).label
}

/** 접수 기기 한 줄 — `앱 2.4.0+28 · iOS 26.0 · iPhone15,4`. 네 값이 다 비면 '—' */
export function reportClientLabel(
  client: {
    appVersion: string | null
    platform: string | null
    osVersion: string | null
    deviceModel: string | null
  } | null,
): string {
  if (!client) return '—'
  const platform =
    client.platform === 'IOS' ? 'iOS' : client.platform === 'ANDROID' ? 'Android' : client.platform
  const os = [platform, client.osVersion].filter(Boolean).join(' ')
  const parts = [
    client.appVersion ? `앱 ${client.appVersion}` : null,
    os || null,
    client.deviceModel,
  ]
  const line = parts.filter(Boolean).join(' · ')
  return line || '—'
}

/**
 * 표가 좁을 때(상세 패널이 열려 있을 때)의 시각 — 연도를 떼 `09-27 15:30`.
 * 같은 해 안의 신고·문의를 훑는 화면이라 연도는 정보가 거의 없다(전체 시각은 패널에 있다).
 */
export function formatMonthDayTime(iso: string | null): string {
  const full = formatDateTime(iso)
  return full === '—' ? full : full.slice(5)
}

// ── 이벤트 팝업 (CHMO-928) ────────────────────────────────────────

/**
 * BE PopupStatus → 배지. 새 색을 만들지 않는 원칙(문의 배지와 같음): 노출 중=지금 나가는 중(초록) ·
 * 예정=곧 나간다(갈색) · 종료=기간이 끝났다(옅은 회색) · 꺼짐=운영자가 껐다(진한 회색).
 * 종료와 꺼짐을 같은 회색 계열로 두되 농도를 가른다 — 둘 다 "안 나간다"지만 꺼짐은 손으로
 * 다시 켤 수 있는 상태라 조금 더 눈에 걸려야 한다.
 */
const POPUP_STATUS_BADGES: Record<string, { label: string; token: string }> = {
  LIVE: { label: '노출 중', token: 'published' },
  SCHEDULED: { label: '예정', token: 'ready' },
  ENDED: { label: '종료', token: 'empty' },
  OFF: { label: '꺼짐', token: 'review' },
}

export function popupStatusBadge(status: string): { label: string; token: string } {
  return POPUP_STATUS_BADGES[status] ?? { label: status, token: 'empty' }
}

/** BE PopupAudience — 계정 유형(가입 때 고른 개인/선생님) 기준이다. 모임 역할과 무관 */
export function popupAudienceLabel(audience: string): string {
  if (audience === 'ALL') return '전체'
  if (audience === 'ORGANIZATION') return '선생님 계정'
  if (audience === 'PERSONAL') return '개인 계정'
  return audience
}

export function popupLocaleLabel(locale: string): string {
  if (locale === 'ko') return '한국어'
  if (locale === 'en') return 'English'
  if (locale === 'ja') return '日本語'
  return locale
}

export function popupLinkTargetLabel(target: string): string {
  if (target === 'IN_APP') return '앱 안 브라우저'
  if (target === 'EXTERNAL') return '외부 브라우저'
  return target
}

/** 기간 한 칸 — `10-15 08:00 ~ 10-31 23:59`(KST). 연도가 다르면 연도까지 쓴다 */
export function formatPeriod(startsAt: string, endsAt: string): string {
  const start = formatDateTime(startsAt)
  const end = formatDateTime(endsAt)
  if (start === '—' || end === '—' || start.slice(0, 4) !== end.slice(0, 4)) {
    return `${start} ~ ${end}`
  }
  return `${start.slice(5)} ~ ${end.slice(5)}`
}

/** 링크의 호스트만 — 표 칸에 긴 URL을 다 늘어놓지 않는다(전체는 title 툴팁) */
export function linkHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// ── 혜택 푸시 (CHMO-928) ──────────────────────────────────────────

/**
 * BE CampaignStatus → 배지. 기다리는 일(예약·대기·보내는 중)은 갈색·주황, 끝난 일은 초록,
 * **운영자가 확인해야 하는 일(실패·일부 실패·결과 불명)은 붉은색** — 자동 재발송이 없어서
 * 사람이 보지 않으면 그대로 묻힌다(BE CHMO-926).
 */
const CAMPAIGN_STATUS_BADGES: Record<string, { label: string; token: string }> = {
  SCHEDULED: { label: '예약됨', token: 'ready' },
  QUEUED: { label: '대기 중', token: 'analyzing' },
  SENDING: { label: '보내는 중', token: 'analyzing' },
  SENT: { label: '보냄', token: 'published' },
  PARTIAL: { label: '일부 실패', token: 'report' },
  FAILED: { label: '실패', token: 'report' },
  UNKNOWN: { label: '결과 확인 필요', token: 'report' },
  CANCELLED: { label: '취소됨', token: 'empty' },
}

export function campaignStatusBadge(status: string): { label: string; token: string } {
  return CAMPAIGN_STATUS_BADGES[status] ?? { label: status, token: 'empty' }
}

/** 아직 결과가 나지 않은 상태 — 이력 표가 몇 초마다 다시 읽는 조건 */
export function isCampaignInFlight(status: string): boolean {
  return status === 'QUEUED' || status === 'SENDING'
}

/**
 * 실패 사유 코드(BE CampaignDispatcher·FcmPushSender) → 운영자가 읽을 한 줄.
 * FCM 오류 코드 이름(UNREGISTERED 등)이 그대로 오기도 해 미지 코드는 원문으로 둔다.
 */
const CAMPAIGN_FAILURE_LABELS: Record<string, string> = {
  FCM_NOT_CONFIGURED: '서버에 FCM 설정이 없어요',
  NO_ELIGIBLE_DEVICES: '받을 기기가 없어요',
  OUTSIDE_DELIVERY_HOURS: '야간이 돼 보내지 못했어요',
  DELIVERY_FAILED: '전송에 실패했어요',
  FCM_RESULT_UNKNOWN: 'FCM 응답을 확인하지 못했어요',
  RESULT_UNKNOWN: '결과를 저장하지 못했어요',
}

export function campaignFailureLabel(code: string | null): string | null {
  if (!code) return null
  return CAMPAIGN_FAILURE_LABELS[code] ?? code
}

// ── 사용자·장수·기관 구독 (CHMO-931 — BE CHMO-912) ─────────────────

/** BE SpaceType — 어드민 모임 목록 `유형` 열. 미지 값은 원문 */
export function groupTypeLabel(type: string): string {
  if (type === 'BUSINESS') return '비즈니스'
  if (type === 'GENERAL') return '일반'
  return type
}

/** BE AccountType — 가입 때 고른 탭. 모임 역할(관리자/멤버)과는 다른 축이라 '선생님'이라 쓰지 않는다 */
export function accountTypeLabel(type: string): string {
  if (type === 'PERSONAL') return '개인'
  if (type === 'ORGANIZATION') return '기관'
  return type
}

/**
 * BE CreditReason → 장부 사유. 운영자 조정만 메모를 갖는다. SIGNUP·MIGRATION은 둘 다 첫 지급인데
 * 적용 시각 전 가입자(500장)와 뒤 가입자(50장)를 가른 것이라 이름을 다르게 둔다.
 */
export function creditReasonLabel(reason: string): string {
  if (reason === 'SIGNUP') return '가입 지급'
  if (reason === 'MIGRATION') return '전환 지급'
  if (reason === 'DAILY') return '일일 적립'
  if (reason === 'UPLOAD') return '업로드 차감'
  if (reason === 'ADMIN_ADJUST') return '운영자 조정'
  return reason
}

/** 증감 표기 — `+100` · `−32`. 0은 일일 적립 시도 기록(상한이라 적립 안 됨)이라 `0` 그대로 */
export function formatSignedCount(delta: number): string {
  if (delta > 0) return `+${formatCount(delta)}`
  if (delta < 0) return `−${formatCount(-delta)}`
  return '0'
}

/**
 * BE SubscriptionAccessStatus → 배지. 새 색 없이 토큰 재사용(이벤트·문의 배지와 같은 규칙):
 * 이용 중=초록 · 유예=주황(곧 막힌다 — 손댈 일) · 차단=붉은색(지금 업로드가 안 된다).
 */
const SUBSCRIPTION_ACCESS_BADGES: Record<string, { label: string; token: string }> = {
  ACTIVE: { label: '이용 중', token: 'published' },
  GRACE: { label: '유예 기간', token: 'analyzing' },
  BLOCKED: { label: '차단', token: 'report' },
}

export function subscriptionAccessBadge(status: string): { label: string; token: string } {
  return SUBSCRIPTION_ACCESS_BADGES[status] ?? { label: status, token: 'empty' }
}

export function subscriptionAccessLabel(status: string): string {
  return subscriptionAccessBadge(status).label
}

// ── 모임 과금·패스·사용자 요약 (CHMO-932) ─────────────────────────

/**
 * BE BillingScope — 모임 업로드 판정 축. 개인 = 모임 패스 → 업로더 장수 · 기관 = 과금 소유 기관의
 * 이용 기간(ADR 039). 구계약 응답(값 없음)은 '—'(빈 칸은 "안 불렀나"로 읽히고 대시는 "없다"로 읽힌다).
 */
export function billingScopeLabel(scope: string | null): string {
  if (!scope) return '—'
  if (scope === 'PERSONAL') return '개인'
  if (scope === 'INSTITUTION') return '기관'
  return scope
}

/** BE PassPlan → `7일` — 일수 표는 lib/billing(목 누적 계산과 같은 원천). 미지 플랜은 원문 */
export function passPlanLabel(plan: string): string {
  const days = (PASS_PLAN_DAYS as Record<string, number | undefined>)[plan]
  return days ? `${days}일` : plan
}

/** BE UserRole — `/admin/**` 인가에만 쓰이는 값이라 '관리자'는 어드민 권한이지 모임 역할이 아니다 */
export function userRoleLabel(role: string): string {
  if (role === 'USER') return '일반'
  if (role === 'ADMIN') return '어드민'
  return role
}

/**
 * BE SubscriptionPeriodKind → 기간 출처. 가입 체험(CHMO-940)은 운영자가 등록한 게 아니라서 이력 표에서
 * 갈라 보여야 "누가 넣었나"를 묻지 않는다. 배지 색은 이벤트 토큰 재사용(새 색 없음): 체험=갈색 · 운영자=회색.
 */
export function subscriptionPeriodKindBadge(kind: string): { label: string; token: string } {
  if (kind === 'TRIAL') return { label: '가입 체험', token: 'ready' }
  if (kind === 'ADMIN') return { label: '운영자 등록', token: 'empty' }
  return { label: kind, token: 'empty' }
}
