import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../../components/ScreenStub'

/** 15. 공개 이벤트 앨범 (뷰어) · node 211:1754 · GET /share/:token/events/:eventId */
export function ViewerAlbumsPage() {
  const { token, eventId } = useParams<{ token: string; eventId: string }>()
  return (
    <ScreenStub code="15" title="공개 이벤트 앨범" node="211:1754" subtitle="인물 · 공통 앨범">
      <StubLink to={`/share/${token}/events/${eventId}/albums/alb_1`}>인물 앨범 상세 (16)</StubLink>
      <StubLink to={`/share/${token}/events`}>← 공개 이벤트 목록 (15-L)</StubLink>
    </ScreenStub>
  )
}
