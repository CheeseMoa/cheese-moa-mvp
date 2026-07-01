import { useNavigate } from 'react-router-dom'
import { ScreenStub, StubButton, StubLink } from '../components/ScreenStub'
import { setAccessToken } from '../lib/auth'

/** 01-1. 로그인 · node 243:33 · POST /auth/login */
export function LoginPage() {
  const navigate = useNavigate()
  const devLogin = () => {
    // 개발용 임시 로그인 — 프로덕션 빌드에서는 토큰 주입 안 함(가드가 로그인으로 되돌림)
    if (import.meta.env.DEV) setAccessToken('dev-access-token')
    navigate('/home')
  }
  return (
    <ScreenStub code="01-1" title="로그인" node="243:33" subtitle="닉네임 + 4자리 PIN (구현 예정)">
      <StubButton onClick={devLogin}>임시 로그인 (개발용)</StubButton>
      <StubLink to="/signup">계정 생성 (01-2)</StubLink>
      <StubLink to="/">← 로그인 진입 (01)</StubLink>
    </ScreenStub>
  )
}
