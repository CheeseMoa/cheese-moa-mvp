import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../../components/ScreenStub'

/** 15-L. 공개 이벤트 목록 (뷰어) · GET /share/:token */
export function ViewerEventsPage() {
  const { token } = useParams<{ token: string }>()
  return (
    <ScreenStub code="15-L" title="공개 이벤트" subtitle="공개된 이벤트를 선택하세요">
      <StubLink to={`/share/${token}/events/evt_2`}>공개 이벤트 앨범 예시 (15)</StubLink>
    </ScreenStub>
  )
}
