import { Navigate, Outlet, useParams } from 'react-router-dom'
import { getAccessToken } from '../lib/auth'
import { getViewerToken } from '../lib/viewer'

/**
 * 제작자(로그인) 가드 — accessToken이 없으면 로그인 화면으로 보낸다.
 * 무효 토큰은 API 401 때 apiFetch가 지우므로 존재 검사로 충분하다(갱신 없음 — MVP).
 */
export function CreatorGuard() {
  const token = getAccessToken()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

/**
 * 공개(비로그인 진입: 01·01-1·01-2) 가드 — 로그인 토큰 보유 시 홈으로 (screen-spec 01 상태).
 * 무효 토큰은 API 401 때 apiFetch가 지우므로 여기선 존재 검사로 충분하다.
 */
export function GuestGuard() {
  if (getAccessToken()) {
    return <Navigate to="/home" replace />
  }
  return <Outlet />
}

/**
 * 학부모(무로그인 뷰어) 가드 — 해당 모임 공유 토큰의 viewerToken이 없으면 잠금 해제 화면으로 보낸다.
 * 무효 뷰어 토큰도 API 401 때 apiFetch가 지워 존재 검사로 복귀가 성립한다.
 */
export function ViewerGuard() {
  const { token } = useParams<{ token: string }>()
  const viewerToken = token ? getViewerToken(token) : null
  if (!token || !viewerToken) {
    return <Navigate to={token ? `/share/${token}` : '/'} replace />
  }
  return <Outlet />
}
