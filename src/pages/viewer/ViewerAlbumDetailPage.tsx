import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../../components/PhoneShell'
import { PhotoLightbox } from '../../components/PhotoLightbox'
import {
  Button,
  Header,
  IconDownload,
  LoadState,
  PhotoGrid,
  PhotoTile,
  useToast,
} from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useAlive } from '../../hooks/useAlive'
import { redirectIfUnauthorized, toErrorMessage } from '../../api/client'
import { getViewerAlbumPhotos, getViewerAlbumZip } from '../../api/viewer'
import { copyToClipboard } from '../../lib/clipboard'
import { downloadViaBlob } from '../../lib/download'

/**
 * 16. 인물 앨범 상세 (뷰어, 무로그인) · node 211:1822/211:1844
 * GET /share/:token/events/:eventId/albums/:albumId (+ /download)
 * 사진 그리드(검토 완료 사진만 — 서버 필터) + [⤓ 다운로드](일괄 zip) + [↗ 공유](링크 재공유).
 * 개별 다운로드는 사진 탭 → 라이트박스에서(와이어프레임 없는 표면 — screen-spec 16 확정).
 * 라이트박스는 09 검수와 공용(PhotoLightbox, CHMO-242 승격) — 좌우 스와이프 이동 포함.
 */
export function ViewerAlbumDetailPage() {
  const {
    token = '',
    eventId = '',
    albumId = '',
  } = useParams<{ token: string; eventId: string; albumId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const api = useApi(`viewer-album:${token}:${eventId}:${albumId}`, (signal) =>
    getViewerAlbumPhotos(token, eventId, albumId, signal),
  )
  const [downloading, setDownloading] = useState(false)
  const [viewIndex, setViewIndex] = useState<number | null>(null)

  const alive = useAlive()

  const album = api.data?.album
  const photos = api.data?.photos ?? []
  const hasPhotos = photos.length > 0

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await getViewerAlbumZip(token, eventId, albumId)
      if (!alive.current) return
      const ok = await downloadViaBlob(res.downloadUrl, `${album?.name ?? 'album'}.zip`)
      if (!alive.current) return
      toast.show(ok ? '🧀 다운로드를 시작했어요' : '다운로드하지 못했어요. 다시 시도해 주세요.')
      setDownloading(false)
    } catch (err) {
      if (!alive.current) return
      if (redirectIfUnauthorized(err, navigate, { to: `/share/${token}` })) return
      toast.show(toErrorMessage(err))
      setDownloading(false)
    }
  }

  // 공유 = 받은 공유 링크 재공유(뷰어 딥링크가 아니라 잠금 해제 입구 URL — 받는 쪽도 비밀번호로 해제)
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/share/${token}`
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl })
        return
      } catch (err) {
        // 사용자가 시트를 닫은 취소만 정상 흐름 — 그 외(웹뷰 권한 차단 등)는 복사로 폴백
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    const ok = await copyToClipboard(shareUrl)
    toast.show(ok ? '🧀 공유 링크를 복사했어요' : '복사하지 못했어요. 다시 시도해 주세요.')
  }

  return (
    <PhoneShell>
      <Header backTo={`/share/${token}/events/${eventId}`} backLabel="공개 이벤트 앨범" />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 사진이 많아 프레임(844)을 넘을 수 있어 그리드는 스크롤, 하단 액션은 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          {album ? (
            <>
              <h1 className="truncate text-xl font-bold text-heading">{album.name}</h1>
              {hasPhotos ? (
                <div className="mt-4">
                  <PhotoGrid>
                    {photos.map((photo, i) => (
                      <PhotoTile
                        key={photo.id}
                        src={photo.thumbnailUrl}
                        onClick={() => setViewIndex(i)}
                      />
                    ))}
                  </PhotoGrid>
                </div>
              ) : (
                <p className="py-11 text-center text-sm text-muted">이 앨범에 사진이 없어요.</p>
              )}
            </>
          ) : (
            <LoadState
              loading={api.loading}
              error={api.error}
              loadingText="앨범을 불러오는 중…"
              onRetry={api.refetch}
              unauthorizedTo={`/share/${token}`}
              notFoundTo={`/share/${token}/events/${eventId}`}
              notFoundLabel="공개 앨범으로"
            />
          )}
        </div>

        {album && hasPhotos && (
          <div className="flex gap-2.5 px-5 pb-safe-9 pt-4">
            <Button className="flex-1 gap-1.5 !px-2" disabled={downloading} onClick={handleDownload}>
              {downloading ? (
                '준비 중…'
              ) : (
                <>
                  <IconDownload size={18} />
                  다운로드
                </>
              )}
            </Button>
            <Button variant="secondary" className="flex-1 !px-2" onClick={handleShare}>
              ↗ 공유
            </Button>
          </div>
        )}
      </main>

      {viewIndex != null && photos[viewIndex] && (
        <PhotoLightbox
          photos={photos}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
        />
      )}
    </PhoneShell>
  )
}
