import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 초대(선생님 초대하기) · node 211:1556 · GET /groups/:id/invite */
export function InvitePage() {
  const { groupId } = useParams<{ groupId: string }>()
  return (
    <ScreenStub code="초대" title="선생님 초대하기" node="211:1556" subtitle="모임 비밀번호 · 참여 링크 공유">
      <StubLink to={`/groups/${groupId}`}>← 모임 상세 (05)</StubLink>
    </ScreenStub>
  )
}
