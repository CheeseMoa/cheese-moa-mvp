import { useNavigate } from 'react-router-dom'
import { ScreenStub, StubButton, StubLink } from '../components/ScreenStub'
import { clearAccessToken } from '../lib/auth'

/** 설정 / 프로필 편집 · node 240:53 · GET /me, PATCH /me */
export function SettingsPage() {
  const navigate = useNavigate()
  const logout = () => {
    clearAccessToken()
    navigate('/')
  }
  return (
    <ScreenStub
      code="설정"
      title="프로필 편집"
      node="240:53"
      subtitle="닉네임 · PIN 변경 (구현 예정)"
    >
      <StubLink to="/home">← 홈 / 내 모임 (02)</StubLink>
      <StubButton onClick={logout} variant="ghost">
        로그아웃
      </StubButton>
    </ScreenStub>
  )
}
