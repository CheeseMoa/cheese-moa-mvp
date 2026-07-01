import { useParams } from 'react-router-dom'
import { ScreenStub, StubLink } from '../../components/ScreenStub'

/** 16. 인물 앨범 상세 (뷰어) · node 211:1822 · GET /share/:token/events/:eventId/albums/:albumId */
export function ViewerAlbumDetailPage() {
  const { token, eventId } = useParams<{ token: string; eventId: string; albumId: string }>()
  return (
    <ScreenStub code="16" title="인물 앨범" node="211:1822" subtitle="사진 그리드 · 다운로드 · 공유">
      <StubLink to={`/share/${token}/events/${eventId}`}>← 공개 이벤트 앨범 (15)</StubLink>
    </ScreenStub>
  )
}
