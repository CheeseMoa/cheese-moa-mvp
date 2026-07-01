import { useNavigate } from 'react-router-dom'
import { ScreenStub, StubButton, StubLink } from '../components/ScreenStub'
import { setAccessToken } from '../lib/auth'

/** 01-2. 계정 생성 · node 243:2 · POST /auth/signup */
export function SignupPage() {
  const navigate = useNavigate()
  const devSignup = () => {
    setAccessToken('dev-access-token')
    navigate('/home')
  }
  return (
    <ScreenStub code="01-2" title="계정 생성" node="243:2" subtitle="닉네임 + 4자리 PIN (구현 예정)">
      <StubButton onClick={devSignup}>임시 가입 (개발용)</StubButton>
      <StubLink to="/login">로그인 (01-1)</StubLink>
      <StubLink to="/">← 로그인 진입 (01)</StubLink>
    </ScreenStub>
  )
}
