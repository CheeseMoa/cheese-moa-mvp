import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 06-U. 사진 업로드 · node 211:1584 · POST /events/:id/photos/presign → S3 PUT, /analyze */
export function PhotoUploadPage() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>()
  return (
    <ScreenStub code="06-U" title="사진 업로드" node="211:1584" subtitle="다중 선택 · 분석 옵션 (구현 예정)">
      <StubLink to={`/groups/${groupId}/events/${eventId}`}>← 이벤트 상세 (08)</StubLink>
    </ScreenStub>
  )
}
