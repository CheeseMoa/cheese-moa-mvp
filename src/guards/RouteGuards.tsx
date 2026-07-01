import { Navigate, Outlet, useParams } from 'react-router-dom'
import { getAccessToken } from '../lib/auth'
import { getViewerToken } from '../lib/viewer'

/**
 * 제작자(로그인) 가드 스텁.
 * accessToken이 없으면 로그인 화면으로 보낸다.
 * (실제 토큰 검증/갱신은 후속 스토리에서 확장.)
 */
export function CreatorGuard() {
  const token = getAccessToken()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

/**
 * 학부모(무로그인 뷰어) 가드 스텁.
 * 해당 모임 공유 토큰의 viewerToken이 없으면 잠금 해제 화면으로 보낸다.
 */
export function ViewerGuard() {
  const { token } = useParams<{ token: string }>()
  const viewerToken = token ? getViewerToken(token) : null
  if (!token || !viewerToken) {
    return <Navigate to={token ? `/share/${token}` : '/'} replace />
  }
  return <Outlet />
}
