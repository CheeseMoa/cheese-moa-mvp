import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../../components/PhoneShell'
import { Badge, ErrorState, Header } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import type { EventItem, ViewerAlbum } from '../../types/api'

interface ViewerAlbumsResponse {
  event: Pick<EventItem, 'id' | 'name'>
  albums: ViewerAlbum[]
}

/**
 * 15. 공개 이벤트 앨범 (뷰어, 무로그인) · node 211:1754/211:1789 · GET /share/:token/events/:eventId
 * person/common 앨범만 서버가 필터해 내려준다(특수 앨범 비노출 — FE는 받은 대로 렌더).
 * 제작자 08 그리드와 달리 검토 배지·테두리 규칙 없음(뷰어에는 검수 개념 자체를 노출하지 않는다).
 */
export function ViewerAlbumsPage() {
  const { token = '', eventId = '' } = useParams<{ token: string; eventId: string }>()
  const navigate = useNavigate()
  const api = useApi<ViewerAlbumsResponse>(`/share/${token}/events/${eventId}`, {
    auth: 'viewer',
    viewerShareToken: token,
  })

  const albums = api.data?.albums ?? []

  return (
    <PhoneShell>
      <Header backTo={`/share/${token}/events`} backLabel="공개 이벤트" title="공개 이벤트 앨범" />
      <main className="flex flex-1 flex-col px-5 pb-9 pt-5">
        {api.data ? (
          <>
            <div className="flex items-center gap-2.5">
              <h2 className="min-w-0 truncate text-xl font-bold text-text">
                {api.data.event.name}
              </h2>
              {/* 공개된 이벤트만 도달 가능한 화면 — 배지는 상태 표시가 아니라 라벨(spec 15) */}
              <Badge variant="published">공개됨</Badge>
            </div>

            {albums.length === 0 ? (
              <p className="py-11 text-center text-sm text-muted">공개된 사진이 아직 없어요.</p>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {albums.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => navigate(`/share/${token}/events/${eventId}/albums/${album.id}`)}
                    className="w-full rounded-2xl border border-border bg-white p-2 text-left transition active:scale-[0.99]"
                  >
                    <span className="cheese-dots block h-24 overflow-hidden rounded-[10px] bg-photo">
                      {album.coverThumbnailUrl && (
                        <img
                          src={album.coverThumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="mt-2 block min-w-0">
                      <span className="block truncate text-sm font-bold text-text">
                        {album.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {album.photoCount}장
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : api.loading ? (
          <p className="py-11 text-center text-sm text-muted">앨범을 불러오는 중…</p>
        ) : api.error ? (
          <ErrorState
            error={api.error}
            onRetry={api.refetch}
            unauthorizedTo={`/share/${token}`}
            notFoundTo={`/share/${token}/events`}
            notFoundLabel="공개 이벤트로"
          />
        ) : null}
      </main>
    </PhoneShell>
  )
}
