import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 05. 모임 상세 = 이벤트 목록 · node 211:1443 · GET /groups/:id, /groups/:id/events */
export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const base = `/groups/${groupId}`
  return (
    <ScreenStub code="05" title="모임 상세" node="211:1443" subtitle="이벤트 목록 · 모임 액션 허브">
      <StubLink to={`${base}/events/evt_1`}>이벤트 상세 예시 (08)</StubLink>
      <StubLink to={`${base}/invite`}>＋ 선생님 초대 (초대)</StubLink>
      <StubLink to="/home">← 홈 / 내 모임 (02)</StubLink>
    </ScreenStub>
  )
}
