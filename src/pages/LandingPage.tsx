import { Navigate } from 'react-router-dom'
import { ScreenStub, StubLink } from '../components/ScreenStub'
import { isAuthenticated } from '../lib/auth'

/** 01. 로그인 진입 · node 211:1343 */
export function LandingPage() {
  if (isAuthenticated()) {
    return <Navigate to="/home" replace />
  }
  return (
    <ScreenStub
      code="01"
      title="치즈모아"
      node="211:1343"
      subtitle="사진 정리부터 공유까지 한 번에"
    >
      <StubLink to="/login">로그인 (01-1)</StubLink>
      <StubLink to="/signup">계정 생성 (01-2)</StubLink>
      <StubLink to="/share/shr_grp1">학부모 공유 진입 예시 (뷰어)</StubLink>
    </ScreenStub>
  )
}
