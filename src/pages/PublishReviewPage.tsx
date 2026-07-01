import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 14. 공개 전 검수 · node 211:1723 · GET /events/:id/review-summary, POST /events/:id/publish */
export function PublishReviewPage() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>()
  return (
    <ScreenStub code="14" title="공개 전 검수" node="211:1723" subtitle="요약 통계 · 공개하기">
      <StubLink to={`/groups/${groupId}/events/${eventId}`}>← 이벤트 상세 (08)</StubLink>
    </ScreenStub>
  )
}
