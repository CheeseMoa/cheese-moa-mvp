/**
 * 어드민 엔드포인트 (CHMO-379 — BE CHMO-377·378) — 화면은 URL·응답 형태를 모른다(CHMO-192 원칙).
 * 전부 `/admin/*` 아래·기존 JWT 그대로(관리자 role 필요) — 비관리자는 ADMIN403(→ NOT_ADMIN),
 * 무토큰은 COMMON401. 공유하는 것은 바닥 인프라(api/client)뿐이다(격리 규칙 2).
 */
import { apiFetch, apiFetchPaged, type BePageInfo } from '../../api/client'
import { setAuthTokens, setCurrentUserId } from '../../lib/auth'
import {
  toAdminGroupDetail,
  toAdminGroupRow,
  toAdminProfile,
  toAdminStats,
  type RawAdminGroupDetail,
  type RawAdminGroupRow,
  type RawAdminProfile,
  type RawAdminStats,
} from './mappers'
import type {
  AdminGroupDetail,
  AdminGroupListParams,
  AdminGroupRow,
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
 */
export async function listAdminGroups(
  params: AdminGroupListParams,
  signal?: AbortSignal,
): Promise<AdminGroupPage> {
  const search = new URLSearchParams({ page: String(params.page) })
  if (params.size !== undefined) search.set('size', String(params.size))
  // BE는 공백 q를 무시하지만 애초에 싣지 않는다 — URL이 곧 useApi 캐시 키라 공백 유무로 갈리면 안 된다
  const q = params.q?.trim()
  if (q) search.set('q', q)
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
