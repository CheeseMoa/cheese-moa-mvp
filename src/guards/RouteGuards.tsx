import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { getAccessToken } from '../lib/auth'
import { getViewerToken } from '../lib/viewer'

/**
 * 제작자(로그인) 가드 — accessToken이 없으면 로그인 화면으로 보낸다.
 * 무효 토큰은 API 401 때 apiFetch가 지우므로 존재 검사로 충분하다(갱신 없음 — MVP).
 *
 * 가로막힌 목적지를 `returnTo`로 넘긴다 (CHMO-667 AC-3) — 알림을 탭해 들어온 사람이
 * 로그아웃 상태면 로그인 후 **그 화면**에 닿아야지 홈으로 흩어지면 알림을 누른 의미가 없다.
 * 파이프라인은 초대 링크(JoinPage)가 쓰던 것 그대로다: 01 랜딩이 state.returnTo를 읽어
 * 소셜은 sessionStorage로 위탁(외부 리다이렉트가 router state를 지운다), PIN 폼은 직접 쓴다.
 * 쿼리·해시까지 싣는 이유는 딥링크가 파라미터를 달고 올 수 있어서다.
 */
export function CreatorGuard() {
  const token = getAccessToken()
  const location = useLocation()
  if (!token) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ returnTo }} />
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
