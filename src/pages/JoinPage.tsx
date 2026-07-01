import { useNavigate, useParams } from 'react-router-dom'
import { ScreenStub, StubButton, StubLink } from '../components/ScreenStub'
import { isAuthenticated, setAccessToken } from '../lib/auth'

/** 02-1. 모임 참여 (초대 링크 진입) · node 211:1520 · POST /groups/join */
export function JoinPage() {
  const { joinKey } = useParams<{ joinKey: string }>()
  const navigate = useNavigate()

  // 참여는 로그인 상태를 전제로 한다. 미로그인이면 로그인 유도(스텁).
  const joinAndGo = () => {
    if (!isAuthenticated()) setAccessToken('dev-access-token')
    navigate('/groups/grp_1')
  }

  return (
    <ScreenStub
      code="02-1"
      title="모임 참여"
      node="211:1520"
      subtitle={`초대 코드: ${joinKey ?? '—'} · 모임 비밀번호 입력 (구현 예정)`}
    >
      <StubButton onClick={joinAndGo}>임시 참여 후 모임으로 (개발용)</StubButton>
      <StubLink to="/home">홈 / 내 모임 (02)</StubLink>
    </ScreenStub>
  )
}
