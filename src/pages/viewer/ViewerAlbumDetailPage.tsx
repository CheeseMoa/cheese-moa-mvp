import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../../components/PhoneShell'
import { Button, ErrorState, Header, PhotoGrid, PhotoTile, useToast } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useAlive } from '../../hooks/useAlive'
import { apiFetch, redirectIfUnauthorized, toErrorMessage } from '../../api/client'
import { copyToClipboard } from '../../lib/clipboard'
import type { AlbumDownloadResponse, ViewerAlbum, ViewerPhoto } from '../../types/api'

interface ViewerAlbumDetailResponse {
  album: Pick<ViewerAlbum, 'id' | 'name' | 'photoCount'>
  photos: ViewerPhoto[]
}

/**
 * URL을 blob으로 받아 같은 출처 임시 URL로 저장을 트리거한다.
 * 앵커 직접 다운로드의 두 함정을 피한다: ① 교차 출처 URL(사진 CDN)에선 download
 * 속성이 무시돼 저장 대신 새 탭이 열림 ② 앵커 내비게이션은 일부 브라우저(Firefox)에서
 * 서비스워커를 우회해 MSW 목 zip이 404가 됨 — fetch는 항상 서비스워커를 탄다.
 * 실패 시 false — 호출부가 실패 토스트를 띄운다.
 */
async function downloadViaBlob(url: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 즉시 revoke하면 일부 브라우저가 시작 전 저장을 취소한다 — 지연 해제
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    return true
  } catch {
    return false
  }
}

/**
 * 16. 인물 앨범 상세 (뷰어, 무로그인) · node 211:1822/211:1844
 * GET /share/:token/events/:eventId/albums/:albumId (+ /download)
 * 사진 그리드(검토 완료 사진만 — 서버 필터) + [⤓ 다운로드](일괄 zip) + [↗ 공유](링크 재공유).
 * 개별 다운로드는 사진 탭 → 라이트박스에서(와이어프레임 없는 표면 — screen-spec 16 확정).
 */
export function ViewerAlbumDetailPage() {
  const {
    token = '',
    eventId = '',
    albumId = '',
  } = useParams<{ token: string; eventId: string; albumId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const api = useApi<ViewerAlbumDetailResponse>(
    `/share/${token}/events/${eventId}/albums/${albumId}`,
    { auth: 'viewer', viewerShareToken: token },
  )
  const [downloading, setDownloading] = useState(false)
  const [viewing, setViewing] = useState<ViewerPhoto | null>(null)

  const alive = useAlive()

  const album = api.data?.album
  const photos = api.data?.photos ?? []
  const hasPhotos = photos.length > 0

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await apiFetch<AlbumDownloadResponse>(
        `/share/${token}/events/${eventId}/albums/${albumId}/download`,
        { auth: 'viewer', viewerShareToken: token },
      )
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
                    {photos.map((photo) => (
                      <PhotoTile
                        key={photo.id}
                        src={photo.thumbnailUrl}
                        onClick={() => setViewing(photo)}
                      />
                    ))}
                  </PhotoGrid>
                </div>
              ) : (
                <p className="py-11 text-center text-sm text-muted">이 앨범에 사진이 없어요.</p>
              )}
            </>
          ) : api.loading ? (
            <p className="py-11 text-center text-sm text-muted">앨범을 불러오는 중…</p>
          ) : api.error ? (
            <ErrorState
              error={api.error}
              onRetry={api.refetch}
              unauthorizedTo={`/share/${token}`}
              notFoundTo={`/share/${token}/events/${eventId}`}
              notFoundLabel="공개 앨범으로"
            />
          ) : null}
        </div>

        {album && hasPhotos && (
          <div className="flex gap-2.5 px-5 pb-9 pt-4">
            <Button className="flex-1 !px-2" disabled={downloading} onClick={handleDownload}>
              {downloading ? '준비 중…' : '⤓ 다운로드'}
            </Button>
            <Button variant="secondary" className="flex-1 !px-2" onClick={handleShare}>
              ↗ 공유
            </Button>
          </div>
        )}
      </main>

      {viewing && <PhotoLightbox photo={viewing} onClose={() => setViewing(null)} />}
    </PhoneShell>
  )
}

interface PhotoLightboxProps {
  photo: ViewerPhoto
  onClose: () => void
}

/** 사진 크게 보기 + 개별 저장 — Modal과 같은 스크림/뷰포트 중앙 패턴(PhoneShell 안만 덮음) */
function PhotoLightbox({ photo, onClose }: PhotoLightboxProps) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  useEscapeKey(true, onClose)

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    const ok = await downloadViaBlob(photo.downloadUrl, `${photo.id}.jpg`)
    setSaving(false)
    // 성공 피드백은 브라우저 저장 동작 자체 — 실패만 알린다
    if (!ok) toast.show('저장하지 못했어요. 다시 시도해 주세요.')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      onClick={onClose}
      className="absolute inset-0 z-40 bg-text/[.92]"
    >
      <div className="sticky top-0 flex h-dvh max-h-full flex-col items-center justify-center gap-4 px-5">
        <img
          src={photo.url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-[72%] w-full rounded-xl object-contain"
        />
        <div className="flex w-full gap-2.5" onClick={(e) => e.stopPropagation()}>
          <Button className="flex-1 !px-2" disabled={saving} onClick={handleSave}>
            {saving ? '저장 중…' : '⤓ 이 사진 저장'}
          </Button>
          <Button variant="secondary" className="flex-1 !px-2" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  )
}
