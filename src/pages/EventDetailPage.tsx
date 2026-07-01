import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 06-E / 08. 이벤트 상세 = 앨범 그리드 · node 211:1619 · GET /events/:id, /events/:id/albums */
export function EventDetailPage() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>()
  const base = `/groups/${groupId}/events/${eventId}`
  return (
    <ScreenStub code="08" title="이벤트 상세" node="211:1619" subtitle="앨범 그리드 · 검수 허브">
      <StubLink to={`${base}/albums/alb_1`}>앨범 상세 예시 (09)</StubLink>
      <StubLink to={`${base}/upload`}>＋ 사진 추가 / 업로드 (06-U)</StubLink>
      <StubLink to={`${base}/publish`}>공개 전 검수 (14)</StubLink>
      <StubLink to={`/groups/${groupId}`}>← 모임 상세 (05)</StubLink>
    </ScreenStub>
  )
}
