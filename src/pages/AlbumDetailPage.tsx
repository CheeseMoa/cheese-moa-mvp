import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 09. 앨범 상세 · node 211:1685 · GET /albums/:id, PATCH /albums/:id, DELETE /photos */
export function AlbumDetailPage() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string; albumId: string }>()
  return (
    <ScreenStub
      code="09"
      title="앨범 상세"
      node="211:1685"
      subtitle="사진 검토 · 이동(09-1) · 검토 완료"
    >
      <StubLink to={`/groups/${groupId}/events/${eventId}`}>← 이벤트 상세 (08)</StubLink>
    </ScreenStub>
  )
}
