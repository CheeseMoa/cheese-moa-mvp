/**
 * 어드민 엔드포인트 (CHMO-379 — BE CHMO-377·378) — 화면은 URL·응답 형태를 모른다(CHMO-192 원칙).
 * 전부 `/admin/*` 아래·기존 JWT 그대로(관리자 role 필요) — 비관리자는 ADMIN403(→ NOT_ADMIN),
 * 무토큰은 COMMON401. 공유하는 것은 바닥 인프라(api/client)뿐이다(격리 규칙 2).
 */
import { apiFetch, apiFetchPaged, type BePageInfo } from '../../api/client'
import { clearAuthTokens, getRefreshToken, setAuthTokens, setCurrentUserId } from '../../lib/auth'
import {
  toAdminBillingScopeResult,
  toAdminCampaign,
  toAdminCampaignRecipients,
  toAdminCreditAdjustment,
  toAdminGroupDetail,
  toAdminGroupRow,
  toAdminInquiry,
  toAdminOrganizationSubscription,
  toAdminOrganizationSubscriptionHistory,
  toAdminOrganizationSubscriptionPage,
  toAdminPassGrantResult,
  toAdminPassGrantRevokeResult,
  toAdminPopup,
  toAdminPopupImageUpload,
  toAdminProfile,
  toAdminReportDetail,
  toAdminReportRow,
  toAdminStats,
  toAdminUserCredits,
  toAdminUserSearchPage,
  toAdminUserSummary,
  type RawAdminBillingScopeResult,
  type RawAdminCampaign,
  type RawAdminCampaignRecipients,
  type RawAdminCreditAdjustment,
  type RawAdminCursorPage,
  type RawAdminGroupDetail,
  type RawAdminGroupRow,
  type RawAdminInquiry,
  type RawAdminOrganizationSubscription,
  type RawAdminOrganizationSubscriptionHistory,
  type RawAdminOrganizationSubscriptionRow,
  type RawAdminPassGrantResult,
  type RawAdminPassGrantRevokeResult,
  type RawAdminPopup,
  type RawAdminPopupImageUpload,
  type RawAdminProfile,
  type RawAdminReportDetail,
  type RawAdminReportRow,
  type RawAdminStats,
  type RawAdminUserCredits,
  type RawAdminUserRow,
  type RawAdminUserSummary,
} from './mappers'
import type {
  AdminBillingScopeInput,
  AdminBillingScopeResult,
  AdminCampaign,
  AdminCampaignInput,
  AdminCampaignRecipients,
  AdminCreditAdjustment,
  AdminCreditAdjustmentInput,
  AdminCursorPage,
  AdminCursorParams,
  AdminGroupDetail,
  AdminGroupListParams,
  AdminGroupRow,
  AdminInquiry,
  AdminInquiryListParams,
  AdminInquiryStatus,
  AdminOrganizationSubscription,
  AdminOrganizationSubscriptionHistory,
  AdminOrganizationSubscriptionRow,
  AdminPassGrantInput,
  AdminPassGrantResult,
  AdminPassGrantRevokeResult,
  AdminPopup,
  AdminPopupImageUpload,
  AdminPopupInput,
  AdminPopupListParams,
  AdminProfile,
  AdminReportDetail,
  AdminReportListParams,
  AdminReportRow,
  AdminReportStatus,
  AdminStats,
  AdminSubscriptionPeriodInput,
  AdminUserCredits,
  AdminUserRow,
  AdminUserSearchParams,
  AdminUserSummary,
} from './types'

/**
 * 어드민 쓰기 중복 방지 헤더(CHMO-932 — ADR 045). **선택** 헤더라 없으면 서버가 종전처럼 매번 실행한다.
 * 같은 키·같은 내용 = 처음 결과를 다시 돌려줌(네트워크 재시도 안전) · 같은 키·다른 내용 = ADMIN409.
 * 호출부(다이얼로그)가 열 때 키를 만들고 재시도에만 재사용한다(`lib/uuid`).
 */
function idempotencyHeaders(key: string | undefined): { headers?: Record<string, string> } {
  return key ? { headers: { 'Idempotency-Key': key } } : {}
}

export interface AdminCredentials {
  nickname: string
  pin: string
}

/** BE AuthResponse — user 객체 없는 평면 필드(서비스 auth와 같은 계약) */
interface RawAuthTokens {
  userId: number
  accessToken: string
  refreshToken: string
}

/**
 * POST /auth/login — 어드민 진입용 로그인(CHMO-594). 서비스와 같은 계정·같은 엔드포인트지만
 * `src/api/auth.ts`를 import하지 않고 직접 부른다(격리 규칙 2 — 공유는 바닥 인프라뿐. 리포를
 * 가를 때 어드민도 자기 로그인 호출을 가져야 한다). 성공 시 토큰 저장까지 여기서 끝낸다 —
 * 호출부는 게이트(GET /admin/me) 재판정만 한다.
 * 가입 동의 게이트(CHMO-479)는 태우지 않는다 — 어드민 진입은 서비스 이용이 아니고,
 * 그 계정이 서비스 화면으로 로그인하면 그때 걸린다.
 */
export async function adminLogin(credentials: AdminCredentials): Promise<void> {
  const raw = await apiFetch<RawAuthTokens>('/auth/login', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  setAuthTokens(raw)
  // 온보딩 플래그 등 계정 단위 저장의 키 — 서비스 로그인과 같은 규칙(PinLoginForm과 동일)
  setCurrentUserId(raw.userId)
}

/**
 * POST /auth/logout — 서버 refreshToken 무효화 후 로컬 토큰 삭제(CHMO-595).
 * 서비스와 같은 계약: auth 미첨부(만료 accessToken의 재발급 인터셉터 개입 차단 — api/auth.ts
 * logout과 동일 근거). **서버 호출이 실패해도 로컬 로그아웃은 진행한다** — 화면 복귀가
 * 네트워크에 볼모잡히면 안 되고, 무효화 못 한 refreshToken도 만료로 죽는다.
 */
export async function adminLogout(): Promise<void> {
  const refreshToken = getRefreshToken()
  try {
    if (refreshToken) {
      await apiFetch<void>('/auth/logout', {
        method: 'POST',
        auth: 'none',
        body: { refreshToken },
      })
    }
  } catch {
    /* 서버 무효화 실패 무시 — 로컬 로그아웃은 finally가 보장한다 */
  } finally {
    clearAuthTokens()
  }
}

/**
 * GET /admin/me — 관리자 본인 확인(CHMO-377). 관리자가 아니면 ADMIN403이므로
 * FE 어드민 화면 진입 게이트로 쓴다(BE @Operation 명시).
 */
export function getAdminProfile(signal?: AbortSignal): Promise<AdminProfile> {
  return apiFetch<RawAdminProfile>('/admin/me', { signal }).then(toAdminProfile)
}

/**
 * GET /admin/stats — 대시보드 지표(총계 4종 + 최근 7일 신규 3종·활동 2종 + 최근 생성 모임 5개 +
 * 최근 사진이 반영된 이벤트 10개 — CHMO-932). 활동·최근 업로드는 `excludedUserIds` 계정을 뺀다.
 */
export function getAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  return apiFetch<RawAdminStats>('/admin/stats', { signal }).then(toAdminStats)
}

export interface AdminGroupPage {
  items: AdminGroupRow[]
  /** 봉투 pageInfo — 형태가 어긋나면 null(목록은 그대로 그리고 페이지 표기만 접는다) */
  pageInfo: BePageInfo | null
}

/**
 * GET /admin/groups — 전체 모임 목록(페이지네이션). size 1~100·sort·groupType 화이트리스트 밖은
 * COMMON400 — 화면은 셀렉트/버튼으로만 조합해 도달하지 않는다. `sort`를 생략하면 BE 기본값이
 * `lastUploadedAt,desc`(CHMO-932)다.
 * 이름 검색(q)·이름 정렬은 BE가 여전히 받지만 보내지 않는다(types.ts AdminGroupSort 주석).
 */
export async function listAdminGroups(
  params: AdminGroupListParams,
  signal?: AbortSignal,
): Promise<AdminGroupPage> {
  const search = new URLSearchParams({ page: String(params.page) })
  if (params.size !== undefined) search.set('size', String(params.size))
  if (params.sort) search.set('sort', params.sort)
  if (params.groupType) search.set('groupType', params.groupType)

  const { items, pageInfo } = await apiFetchPaged<RawAdminGroupRow[]>(
    `/admin/groups?${search.toString()}`,
    { signal },
  )
  return { items: (items ?? []).map(toAdminGroupRow), pageInfo }
}

/**
 * GET /admin/groups/:groupId — 모임 상세(멤버는 PENDING 포함·이벤트 전건 + 과금 범위·패스·지급 이력·
 * 기관 접근·마지막 업로드 — CHMO-932). 없으면 SPACE404
 */
export function getAdminGroupDetail(
  groupId: number | string,
  signal?: AbortSignal,
): Promise<AdminGroupDetail> {
  return apiFetch<RawAdminGroupDetail>(`/admin/groups/${groupId}`, { signal }).then(
    toAdminGroupDetail,
  )
}

/**
 * PUT /admin/groups/:groupId/billing-scope — 과금 범위·과금 소유자 변경(BE CHMO-912, FE는 CHMO-932부터 —
 * 상세가 현재 값을 주기 전엔 바꾸는 폼을 만들 수 없었다). 기관 범위인데 소유자가 기관 계정이 아니면
 * VALID400, 없는 소유자 USER404, 없는 모임 SPACE404. 감사 이력은 서버가 남긴다(`memo` 필수).
 * 멱등키가 없는 API다(같은 값을 두 번 보내도 결과가 같아 해롭지 않다).
 */
export function changeAdminGroupBillingScope(
  groupId: number | string,
  input: AdminBillingScopeInput,
): Promise<AdminBillingScopeResult> {
  return apiFetch<RawAdminBillingScopeResult>(`/admin/groups/${groupId}/billing-scope`, {
    method: 'PUT',
    body: input,
  }).then(toAdminBillingScopeResult)
}

/**
 * POST /admin/groups/:groupId/pass-grants — 운영자 모임 패스 지급(201 · CHMO-932 A-8). 개인 범위 모임에
 * 1·3·7·30일을 넣고 지급 원장에 남긴다. 살아 있는 패스가 있으면 **그 만료 뒤에** 이어 붙는다(스토어
 * 구매와 같은 규칙). 기관 범위 모임은 VALID400("기관 범위 모임은 이용 기간으로 등록합니다."), 없는
 * 모임 SPACE404. `Idempotency-Key`로 같은 지급이 두 번 나가는 걸 서버가 막는다.
 */
export function grantAdminGroupPass(
  groupId: number | string,
  input: AdminPassGrantInput,
  idempotencyKey?: string,
): Promise<AdminPassGrantResult> {
  return apiFetch<RawAdminPassGrantResult>(`/admin/groups/${groupId}/pass-grants`, {
    method: 'POST',
    body: input,
    ...idempotencyHeaders(idempotencyKey),
  }).then(toAdminPassGrantResult)
}

/**
 * DELETE /admin/pass-grants/:grantId — 지급 회수. 지급분 기간만큼 만료를 앞당기되 **지금 이전으로는
 * 줄이지 않는다**(스토어 환불과 같은 규칙). 원장 행은 남고 `revokedAt`이 찍힌다. 이미 회수된 지급은
 * 변화 없이 같은 결과(멱등), 없는 지급은 BILLING404.
 */
export function revokeAdminPassGrant(grantId: number | string): Promise<AdminPassGrantRevokeResult> {
  return apiFetch<RawAdminPassGrantRevokeResult>(`/admin/pass-grants/${grantId}`, {
    method: 'DELETE',
  }).then(toAdminPassGrantRevokeResult)
}

// ── 기관 도입 문의 (CHMO-811 — BE CHMO-810) ─────────────────────────

export interface AdminInquiryPage {
  items: AdminInquiry[]
  pageInfo: BePageInfo | null
}

/**
 * GET /admin/organization-inquiries — 기관 도입 문의 목록.
 * 정렬은 `createdAt,desc` 고정이라 `sort` 파라미터가 아예 없다(모임 목록과 갈리는 지점).
 * `status`를 생략하면 BE 기본값이 `RECEIVED,CONTACTED`(=진행 중)라, 대시보드 카드는 그대로
 * `size=1`만 실어 `pageInfo.totalElements`를 대기 건수로 읽는다(별도 카운트 API가 없다).
 */
export async function listAdminInquiries(
  params: AdminInquiryListParams,
  signal?: AbortSignal,
): Promise<AdminInquiryPage> {
  const search = new URLSearchParams({ page: String(params.page) })
  if (params.size !== undefined) search.set('size', String(params.size))
  if (params.status) search.set('status', params.status)

  const { items, pageInfo } = await apiFetchPaged<RawAdminInquiry[]>(
    `/admin/organization-inquiries?${search.toString()}`,
    { signal },
  )
  return { items: (items ?? []).map(toAdminInquiry), pageInfo }
}

/**
 * PATCH /admin/organization-inquiries/:id — 상태 전이(어드민의 첫 쓰기 액션).
 * 전이 규칙이 없어 4개 값 전부 보낼 수 있고, 응답은 **갱신된 행**이라 호출부가 재조회 없이
 * 그 행만 바꿔 끼운다. 실패는 INQUIRY404(없는 id)·INQUIRY409(되돌리기 충돌 — 그 사용자에게
 * 이미 진행 중 문의가 있음) 둘뿐이고, 둘 다 화면이 안내 후 목록을 다시 읽는다.
 *
 * `subscriptionPeriod`(CHMO-931 — BE CHMO-912)는 **개통(ONBOARDED)으로 바꿀 때만** 뜻이 있고
 * BE가 같은 트랜잭션으로 첫 이용 기간을 등록한다. 없으면 키 자체를 싣지 않는다(종전 계약 그대로).
 */
export function updateAdminInquiryStatus(
  id: number,
  status: AdminInquiryStatus,
  subscriptionPeriod?: AdminSubscriptionPeriodInput | null,
  signal?: AbortSignal,
): Promise<AdminInquiry> {
  return apiFetch<RawAdminInquiry>(`/admin/organization-inquiries/${id}`, {
    method: 'PATCH',
    body: subscriptionPeriod ? { status, subscriptionPeriod } : { status },
    signal,
  }).then(toAdminInquiry)
}

// ── 신고·문의 (CHMO-862 — BE CHMO-861) ──────────────────────────────

export interface AdminReportPage {
  items: AdminReportRow[]
  pageInfo: BePageInfo | null
}

/**
 * GET /admin/reports — 신고·문의 목록. 정렬은 `createdAt,desc`(동률 id DESC) 고정이라 `sort`가 없다.
 * `status`·`type`을 생략하면 BE 기본값(`RECEIVED,IN_PROGRESS` · `ALL`)이라, 사이드바 배지·대시보드
 * 카드는 `size=1`만 실어 `pageInfo.totalElements`를 처리 대기 건수로 읽는다(기관 문의와 같은 관례 —
 * 전용 카운트 API가 없다).
 */
export async function listAdminReports(
  params: AdminReportListParams,
  signal?: AbortSignal,
): Promise<AdminReportPage> {
  const search = new URLSearchParams({ page: String(params.page) })
  if (params.size !== undefined) search.set('size', String(params.size))
  if (params.status) search.set('status', params.status)
  if (params.type) search.set('type', params.type)

  const { items, pageInfo } = await apiFetchPaged<RawAdminReportRow[]>(
    `/admin/reports?${search.toString()}`,
    { signal },
  )
  return { items: (items ?? []).map(toAdminReportRow), pageInfo }
}

/** GET /admin/reports/:id — 상세(첨부·사진은 presigned GET). 없으면 REPORT404 */
export function getAdminReport(
  id: number | string,
  signal?: AbortSignal,
): Promise<AdminReportDetail> {
  return apiFetch<RawAdminReportDetail>(`/admin/reports/${id}`, { signal }).then(
    toAdminReportDetail,
  )
}

/**
 * POST /admin/reports/:id/reply — 답변. 상태가 `ANSWERED`가 되고 사용자 앱에 미읽음 답변이 선다.
 * **최초 답변만** 사용자에게 푸시(`REPORT_ANSWERED`)가 가고, 재답변은 내용·시각만 갱신한다(알림
 * 폭탄 방지 — BE CHMO-861). 내용은 trim 후 1~2,000자, 벗어나면 VALID400.
 * 응답은 **상세 형태**라 호출부가 패널을 재조회 없이 바꿔 끼운다.
 */
export function replyAdminReport(id: number, content: string): Promise<AdminReportDetail> {
  return apiFetch<RawAdminReportDetail>(`/admin/reports/${id}/reply`, {
    method: 'POST',
    body: { content },
  }).then(toAdminReportDetail)
}

/**
 * PATCH /admin/reports/:id — 상태 전이. 전이 규칙이 없어 4값 전부 보낼 수 있다(같은 값도 성공).
 * 답변이 없는 건의 `ANSWERED`만 VALID400. 응답은 **목록 행 형태**다.
 */
export function updateAdminReportStatus(
  id: number,
  status: AdminReportStatus,
): Promise<AdminReportRow> {
  return apiFetch<RawAdminReportRow>(`/admin/reports/${id}`, {
    method: 'PATCH',
    body: { status },
  }).then(toAdminReportRow)
}

// ── 이벤트 팝업 (CHMO-928 — BE CHMO-926) ────────────────────────────

export interface AdminPopupPage {
  items: AdminPopup[]
  pageInfo: BePageInfo | null
}

/**
 * GET /admin/popups — 팝업 목록(삭제분 제외). 정렬은 popupId DESC 고정이라 `sort`가 없다.
 * `status`는 조회 시각 기준 파생값으로 거른다(OFF가 우선 — active=false면 기간과 무관하게 꺼짐).
 */
export async function listAdminPopups(
  params: AdminPopupListParams,
  signal?: AbortSignal,
): Promise<AdminPopupPage> {
  const search = new URLSearchParams({ page: String(params.page) })
  if (params.size !== undefined) search.set('size', String(params.size))
  if (params.status) search.set('status', params.status)

  const { items, pageInfo } = await apiFetchPaged<RawAdminPopup[]>(
    `/admin/popups?${search.toString()}`,
    { signal },
  )
  return { items: (items ?? []).map(toAdminPopup), pageInfo }
}

/** GET /admin/popups/:id — 상세(수정 화면 프리필). 없거나 삭제됐으면 POPUP404 */
export function getAdminPopup(id: number | string, signal?: AbortSignal): Promise<AdminPopup> {
  return apiFetch<RawAdminPopup>(`/admin/popups/${id}`, { signal }).then(toAdminPopup)
}

/**
 * 팝업 본문 직렬화 — 빈 선택 필드는 **빈 문자열이 아니라 null**로 보낸다. 빈 ctaLabel이
 * 저장되면 앱이 빈 옐로 필을 세운다(앱은 null만 '버튼 없음'으로 읽는다 — CHMO-927).
 */
function popupBody(input: AdminPopupInput) {
  return {
    ...input,
    ctaLabel: input.ctaLabel?.trim() ? input.ctaLabel.trim() : null,
    minAppVersion: input.minAppVersion?.trim() ? input.minAppVersion.trim() : null,
  }
}

/** POST /admin/popups — 생성(201). 서버가 이미지 키를 S3 HEAD로 확인하므로 업로드가 먼저다 */
export function createAdminPopup(input: AdminPopupInput): Promise<AdminPopup> {
  return apiFetch<RawAdminPopup>('/admin/popups', {
    method: 'POST',
    body: popupBody(input),
  }).then(toAdminPopup)
}

/**
 * PUT /admin/popups/:id — **전체 교체**(부분 수정 없음). popupId가 유지되므로 앱에서 이미
 * [오늘 하루 보지 않기]를 누른 사람에게는 오늘 다시 뜨지 않는다 — 다시 보이게 하려면 새로 만든다.
 */
export function updateAdminPopup(id: number, input: AdminPopupInput): Promise<AdminPopup> {
  return apiFetch<RawAdminPopup>(`/admin/popups/${id}`, {
    method: 'PUT',
    body: popupBody(input),
  }).then(toAdminPopup)
}

/** PATCH /admin/popups/:id/active — 켜기/끄기. 응답은 갱신된 행(상태 파생값도 새로 계산됨) */
export function setAdminPopupActive(id: number, active: boolean): Promise<AdminPopup> {
  return apiFetch<RawAdminPopup>(`/admin/popups/${id}/active`, {
    method: 'PATCH',
    body: { active },
  }).then(toAdminPopup)
}

/** DELETE /admin/popups/:id — 숨김 삭제(deletedAt). 성공은 result 없는 공통 응답 */
export function deleteAdminPopup(id: number): Promise<void> {
  return apiFetch<void>(`/admin/popups/${id}`, { method: 'DELETE' })
}

/**
 * POST /admin/popups/images/presign — 이미지 업로드 URL(15분). JPG·PNG만·10 MiB 이하
 * (밖은 POPUP400). **Content-Type과 Content-Length가 서명에 들어가** PUT의 두 값이 요청과
 * 달라지면 S3가 403을 준다 — 그래서 같은 File의 type·size를 그대로 싣는다.
 */
export function presignAdminPopupImage(file: {
  type: string
  size: number
}): Promise<AdminPopupImageUpload> {
  return apiFetch<RawAdminPopupImageUpload>('/admin/popups/images/presign', {
    method: 'POST',
    body: { contentType: file.type, size: file.size },
  }).then(toAdminPopupImageUpload)
}

/**
 * presign URL로 S3에 직접 PUT — API 서버가 아니라 S3라 봉투도 인증 헤더도 없다
 * (apiFetch를 타지 않는다). Content-Length는 브라우저가 본문 크기로 채운다.
 */
export async function putAdminPopupImage(uploadUrl: string, file: Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error(`popup image upload failed: ${res.status}`)
}

// ── 혜택 푸시 (CHMO-928 — BE CHMO-926 B절) ──────────────────────────

/**
 * GET /admin/push-campaigns/recipients — 지금 보내면 받을 사람 수(현재 버전 MARKETING 동의 ∧
 * pushEnabled). DB 최신 상태라 실제 토픽 구독자 수와 잠시 다를 수 있다(BE ADR 041).
 */
export function getAdminCampaignRecipients(
  signal?: AbortSignal,
): Promise<AdminCampaignRecipients> {
  return apiFetch<RawAdminCampaignRecipients>('/admin/push-campaigns/recipients', {
    signal,
  }).then(toAdminCampaignRecipients)
}

/**
 * 캠페인 문구 본문 — 빈 link는 **키째 뺀다**. 요청 필드는 BE가 화이트리스트로 받아(모르는 필드는
 * 400) 키를 덧붙이지 않는다. 같은 키로 재시도할 때 본문 지문이 같아야 해서(다르면 CAMPAIGN409)
 * 이 함수 하나가 직렬화를 소유한다.
 */
function campaignBody(input: AdminCampaignInput) {
  const link = input.link?.trim()
  return { title: input.title, body: input.body, ...(link ? { link } : {}) }
}

/**
 * POST /admin/push-campaigns — 즉시(scheduledAt 생략)·예약 발송 접수(202 COMMON202).
 * **202는 접수 성공일 뿐 FCM 발송 성공이 아니다** — 결과는 이력의 상태로 본다.
 *
 * `Idempotency-Key`(UUID) 필수: 같은 키·같은 본문 = 기존 결과(네트워크 재시도 안전), 같은 키·
 * 다른 본문 = CAMPAIGN409. 호출부가 "같은 발송의 재시도"에만 키를 재사용해야 한다.
 */
export function createAdminCampaign(
  input: AdminCampaignInput,
  scheduledAt: string | null,
  idempotencyKey: string,
): Promise<AdminCampaign> {
  return apiFetch<RawAdminCampaign>('/admin/push-campaigns', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { ...campaignBody(input), ...(scheduledAt ? { scheduledAt } : {}) },
  }).then(toAdminCampaign)
}

/**
 * POST /admin/push-campaigns/test — 지정 사용자의 등록 기기로만(토픽 미경유) 같은 페이로드를
 * 보낸다. 동의·pushEnabled·야간 제한이 똑같이 적용되고, 기기가 없거나 조건이 안 맞으면
 * CAMPAIGN400. **scheduledAt을 실으면 안 된다**(테스트 DTO에 없는 필드 = 400).
 */
export function testAdminCampaign(
  input: AdminCampaignInput,
  userId: number,
  idempotencyKey: string,
): Promise<AdminCampaign> {
  return apiFetch<RawAdminCampaign>('/admin/push-campaigns/test', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { ...campaignBody(input), userId },
  }).then(toAdminCampaign)
}

export interface AdminCampaignPage {
  items: AdminCampaign[]
  pageInfo: BePageInfo | null
}

/** GET /admin/push-campaigns — 발송 이력(campaignId DESC 고정 — 테스트 발송 포함) */
export async function listAdminCampaigns(
  params: { page: number; size?: number },
  signal?: AbortSignal,
): Promise<AdminCampaignPage> {
  const search = new URLSearchParams({ page: String(params.page) })
  if (params.size !== undefined) search.set('size', String(params.size))

  const { items, pageInfo } = await apiFetchPaged<RawAdminCampaign[]>(
    `/admin/push-campaigns?${search.toString()}`,
    { signal },
  )
  return { items: (items ?? []).map(toAdminCampaign), pageInfo }
}

/** POST /admin/push-campaigns/:id/cancel — 예약 취소. SCHEDULED가 아니면 CAMPAIGN409 */
export function cancelAdminCampaign(id: number): Promise<AdminCampaign> {
  return apiFetch<RawAdminCampaign>(`/admin/push-campaigns/${id}/cancel`, {
    method: 'POST',
  }).then(toAdminCampaign)
}

// ── 사용자·장수·기관 구독 (CHMO-931 — BE CHMO-912 어드민 7종 + CHMO-932 조회 확장) ───────
// 과금 범위 변경은 위 모임 절(changeAdminGroupBillingScope)에 있다 — 상세가 현재 값을 주게 된
// CHMO-932부터 FE가 소비한다. 전부 커서 목록·단건 응답이라 pageInfo 봉투를 안 쓴다.

/**
 * GET /admin/users/:userId — 사용자 요약(CHMO-932 A-5): 닉네임·계정 유형·어드민 role·가입일·소셜 종류·
 * 속한 모임(승인 대기 포함, 모임 이름 없음). 없으면 USER404. 종전엔 검색 API를 `query=<id>`로 다시 불러
 * 머리를 채웠다(CHMO-931 우회 — 닉네임에 그 숫자가 섞인 남까지 걸렸다).
 */
export function getAdminUserSummary(
  userId: number | string,
  signal?: AbortSignal,
): Promise<AdminUserSummary> {
  return apiFetch<RawAdminUserSummary>(`/admin/users/${userId}`, { signal }).then(toAdminUserSummary)
}

/**
 * GET /admin/users — 닉네임 부분 일치(대소문자 무시) 또는 userId 정확 일치. `query`가 비면
 * 전체를 최근 가입 순으로. `size`는 BE가 1~50으로 접는다(화면은 상수만 보낸다).
 */
export async function searchAdminUsers(
  params: AdminUserSearchParams,
  signal?: AbortSignal,
): Promise<AdminCursorPage<AdminUserRow>> {
  const search = new URLSearchParams({ query: params.query })
  if (params.cursor != null) search.set('cursor', String(params.cursor))
  if (params.size !== undefined) search.set('size', String(params.size))
  const raw = await apiFetch<RawAdminCursorPage<RawAdminUserRow>>(
    `/admin/users?${search.toString()}`,
    { signal },
  )
  return toAdminUserSearchPage(raw)
}

/**
 * GET /admin/users/:userId/credits — 잔액 + 장부(최신순 커서). 장수 기능이 서버에 안 켜졌으면
 * `BILLING503`(→ BILLING_UNAVAILABLE)이고, 없는 사용자는 `USER404`. 조회가 장부 계정을 지연 생성
 * 하므로(BE `CreditAccountStore.lock`) 한 번도 안 쓴 사용자도 초기 지급 행 하나를 갖고 온다.
 */
export function getAdminUserCredits(
  userId: number | string,
  params: AdminCursorParams = {},
  signal?: AbortSignal,
): Promise<AdminUserCredits> {
  const search = new URLSearchParams()
  if (params.cursor != null) search.set('cursor', String(params.cursor))
  if (params.size !== undefined) search.set('size', String(params.size))
  const query = search.toString()
  return apiFetch<RawAdminUserCredits>(
    `/admin/users/${userId}/credits${query ? `?${query}` : ''}`,
    { signal },
  ).then(toAdminUserCredits)
}

/**
 * POST /admin/users/:userId/credit-adjustments — 장수 지급(+)·회수(−). 응답 201에 조정 뒤 잔액.
 * 회수가 잔액을 넘으면 `CREDIT409`(→ CREDIT_INSUFFICIENT), `delta` 0·메모 누락은 VALID400.
 * `Idempotency-Key`(CHMO-932)로 더블 클릭·재시도의 이중 지급을 서버가 막는다 — 호출부는 전송 중
 * 버튼 잠금도 그대로 둔다(키는 재시도 안전망이지 UI 잠금의 대체가 아니다).
 */
export function adjustAdminUserCredits(
  userId: number | string,
  input: AdminCreditAdjustmentInput,
  idempotencyKey?: string,
): Promise<AdminCreditAdjustment> {
  return apiFetch<RawAdminCreditAdjustment>(`/admin/users/${userId}/credit-adjustments`, {
    method: 'POST',
    body: input,
    ...idempotencyHeaders(idempotencyKey),
  }).then(toAdminCreditAdjustment)
}

/**
 * GET /admin/organizations/subscriptions — 구독 행이 있는 기관(= 기간을 한 번이라도 등록한 기관)만,
 * subscriptionId DESC 커서. 접근 상태는 요청 시각 기준으로 서버가 계산한다.
 */
export async function listAdminOrganizationSubscriptions(
  params: AdminCursorParams = {},
  signal?: AbortSignal,
): Promise<AdminCursorPage<AdminOrganizationSubscriptionRow>> {
  const search = new URLSearchParams()
  if (params.cursor != null) search.set('cursor', String(params.cursor))
  if (params.size !== undefined) search.set('size', String(params.size))
  const query = search.toString()
  const raw = await apiFetch<RawAdminCursorPage<RawAdminOrganizationSubscriptionRow>>(
    `/admin/organizations/subscriptions${query ? `?${query}` : ''}`,
    { signal },
  )
  return toAdminOrganizationSubscriptionPage(raw)
}

/**
 * POST /admin/organizations/:userId/subscription-periods — 입금 기간 등록(201). 기간은 겹쳐도 되고
 * 접근 상태는 무효화되지 않은 기간 중 가장 늦은 종료로 계산된다(연장 = 새 기간 추가).
 * 기관 계정이 아니면·종료가 시작보다 앞이면 VALID400, 없는 사용자는 USER404.
 * `Idempotency-Key`(CHMO-932)로 같은 기간이 두 번 등록되는 걸 서버가 막는다.
 */
export function registerAdminSubscriptionPeriod(
  userId: number | string,
  input: AdminSubscriptionPeriodInput,
  idempotencyKey?: string,
): Promise<AdminOrganizationSubscription> {
  return apiFetch<RawAdminOrganizationSubscription>(
    `/admin/organizations/${userId}/subscription-periods`,
    { method: 'POST', body: input, ...idempotencyHeaders(idempotencyKey) },
  ).then(toAdminOrganizationSubscription)
}

/**
 * GET /admin/organizations/:userId/subscription — 기관 접근 상태 + **무효화분을 포함한** 기간 이력
 * (등록 최신순 — CHMO-932 A-4). 기간마다 `kind`(TRIAL 가입 체험 | ADMIN)·`adminId`·`voidedAt`·`voidedBy`.
 * 구독 행이 없는 기관은 404가 아니라 빈 이력 + BLOCKED, 없는 사용자 USER404, 기관 계정 아님 VALID400.
 * 이게 생겨 무효화할 `periodId`를 등록 응답이 아니어도 안다(종전엔 이번 세션에 등록한 것만 되돌렸다).
 */
export function getAdminOrganizationSubscriptionHistory(
  userId: number | string,
  signal?: AbortSignal,
): Promise<AdminOrganizationSubscriptionHistory> {
  return apiFetch<RawAdminOrganizationSubscriptionHistory>(
    `/admin/organizations/${userId}/subscription`,
    { signal },
  ).then(toAdminOrganizationSubscriptionHistory)
}

/**
 * DELETE /admin/organization-subscription-periods/:periodId — 하드 삭제가 아니라 `voidedAt` 기록
 * (멱등 — 이미 무효화된 기간을 또 불러도 200). 없는 id는 BILLING404. 응답의 nickname은 null이다.
 */
export function voidAdminSubscriptionPeriod(
  periodId: number | string,
): Promise<AdminOrganizationSubscription> {
  return apiFetch<RawAdminOrganizationSubscription>(
    `/admin/organization-subscription-periods/${periodId}`,
    { method: 'DELETE' },
  ).then(toAdminOrganizationSubscription)
}
