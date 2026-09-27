/**
 * 어드민 표시 포맷·표시명 단일 원천 (CHMO-379).
 * 값이 비면 전부 '—'로 수렴한다 — 표에서 빈 칸은 "안 불렀나"로 읽히고 대시는 "없다"로 읽힌다.
 */
import type { AdminMemberStatus } from '../api/types'

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

// 신·구 직렬화 값을 함께 받는다(CHMO-605 리네이밍 — 운영 BE는 main 머지 전까지 구 값) ·
// 미지 값은 원문 중립 표기(eventStatusBadge와 같은 결)라 파라미터를 string으로 연다
export function memberRoleLabel(role: string): string {
  if (role === 'EDITOR' || role === 'TEACHER') return '선생님'
  if (role === 'VIEWER' || role === 'PARENT') return '학부모'
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
