/**
 * 어드민 엔드포인트 (CHMO-379 — BE CHMO-377·378) — 화면은 URL·응답 형태를 모른다(CHMO-192 원칙).
 * 전부 `/admin/*` 아래·기존 JWT 그대로(관리자 role 필요) — 비관리자는 ADMIN403(→ NOT_ADMIN),
 * 무토큰은 COMMON401. 공유하는 것은 바닥 인프라(api/client)뿐이다(격리 규칙 2).
 */
import { apiFetch, apiFetchPaged, type BePageInfo } from '../../api/client'
import { clearAuthTokens, getRefreshToken, setAuthTokens, setCurrentUserId } from '../../lib/auth'
import {
  toAdminGroupDetail,
  toAdminGroupRow,
  toAdminInquiry,
  toAdminProfile,
  toAdminStats,
  type RawAdminGroupDetail,
  type RawAdminGroupRow,
  type RawAdminInquiry,
  type RawAdminProfile,
  type RawAdminStats,
} from './mappers'
import type {
  AdminGroupDetail,
  AdminGroupListParams,
  AdminGroupRow,
  AdminInquiry,
  AdminInquiryListParams,
  AdminInquiryStatus,
  AdminProfile,
  AdminStats,
} from './types'

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

/** GET /admin/stats — 대시보드 지표(총계 4종 + 최근 7일 3종 + 최근 생성 모임 5개) */
export function getAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  return apiFetch<RawAdminStats>('/admin/stats', { signal }).then(toAdminStats)
}

export interface AdminGroupPage {
  items: AdminGroupRow[]
  /** 봉투 pageInfo — 형태가 어긋나면 null(목록은 그대로 그리고 페이지 표기만 접는다) */
  pageInfo: BePageInfo | null
}

/**
 * GET /admin/groups — 전체 모임 목록(페이지네이션). size 1~100·sort 화이트리스트 밖은
 * COMMON400 — 화면은 셀렉트/버튼으로만 조합해 도달하지 않는다.
 * 이름 검색(q)·이름 정렬은 BE가 여전히 받지만 보내지 않는다(types.ts AdminGroupSort 주석).
 */
export async function listAdminGroups(
  params: AdminGroupListParams,
  signal?: AbortSignal,
): Promise<AdminGroupPage> {
  const search = new URLSearchParams({ page: String(params.page) })
  if (params.size !== undefined) search.set('size', String(params.size))
  if (params.sort) search.set('sort', params.sort)

  const { items, pageInfo } = await apiFetchPaged<RawAdminGroupRow[]>(
    `/admin/groups?${search.toString()}`,
    { signal },
  )
  return { items: (items ?? []).map(toAdminGroupRow), pageInfo }
}

/** GET /admin/groups/:groupId — 모임 상세(멤버는 PENDING 포함·이벤트 전건). 없으면 SPACE404 */
export function getAdminGroupDetail(
  groupId: number | string,
  signal?: AbortSignal,
): Promise<AdminGroupDetail> {
  return apiFetch<RawAdminGroupDetail>(`/admin/groups/${groupId}`, { signal }).then(
    toAdminGroupDetail,
  )
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
 */
export function updateAdminInquiryStatus(
  id: number,
  status: AdminInquiryStatus,
  signal?: AbortSignal,
): Promise<AdminInquiry> {
  return apiFetch<RawAdminInquiry>(`/admin/organization-inquiries/${id}`, {
    method: 'PATCH',
    body: { status },
    signal,
  }).then(toAdminInquiry)
}
