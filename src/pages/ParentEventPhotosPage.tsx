import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { PhotoLightbox } from '../components/PhotoLightbox'
import {
  Button,
  EmptyState,
  Header,
  IconDownload,
  LoadState,
  PhotoGrid,
  PhotoTile,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { listGroups } from '../api/groups'
import { getParentEventPhotos, getParentPhotosZip } from '../api/events'
import { downloadViaBlob } from '../lib/download'

/**
 * 19. 학부모 사진 그리드 (ACTIVE PARENT) · node 307:27 · CHMO-448
 * GET /events/:id/parent-photos — 매핑 인물 + 공통, published만, 플랫(앨범 계층 없음 §3).
 * 아이가 안 나온 이벤트·미연결은 서버가 404로 은닉한다(노출 강화 — 18 목록 필터와 동일 판정,
 * LoadState notFoundTo가 모임으로 되돌린다). 사진 탭 → 공용 라이트박스(개별 저장) ·
 * [↓ 전체 저장] = parent-photos/download zip. 모임명(뒤로가기 라벨)·자녀 이름은 모임 목록
 * myMembership에서 — 검토·발행 대기 등 제작자 필드는 응답에 없고 화면도 다루지 않는다.
 */
export function ParentEventPhotosPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const toast = useToast()
  const mutate = useMutation()
  const groupsApi = useApi('groups', listGroups)
  const photosApi = useApi(`parent-photos:${eventId}`, (signal) =>
    getParentEventPhotos(eventId, signal),
  )
  const [downloading, setDownloading] = useState(false)
  const [viewIndex, setViewIndex] = useState<number | null>(null)

  const group = groupsApi.data?.find((g) => String(g.id) === groupId) ?? null
  const linkedNames = group?.myMembership?.linkedChildNames ?? []
  const data = photosApi.data
  const photos = data?.photos ?? []
  const hasPhotos = photos.length > 0

  // "공통 포함"은 자녀 이름이 있을 때만 — 이름이 아직 없으면(모임 목록이 사진보다 늦게 도착)
  // 중립 표기로 두고, 목록이 오면 자녀 이름 표기로 채워진다
  const countText =
    linkedNames.length > 0
      ? `${linkedNames.join(', ')} · 공통 포함 ${photos.length}장`
      : `사진 ${photos.length}장`

  const handleDownloadAll = async () => {
    if (downloading) return
    setDownloading(true)
    await mutate(
      async () => {
        const res = await getParentPhotosZip(eventId)
        return downloadViaBlob(res.downloadUrl, `${data?.eventName ?? 'photos'}.zip`)
      },
      {
        onSuccess: (ok) => {
          toast.show(ok ? '🧀 저장을 시작했어요' : '저장하지 못했어요. 다시 시도해 주세요.')
          setDownloading(false)
        },
        onError: (msg) => {
          toast.show(msg)
          setDownloading(false)
        },
      },
    )
  }

  return (
    <PhoneShell>
      <Header backTo={`/parent/groups/${groupId}`} backLabel={group?.name ?? '모임'} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 사진이 많아 프레임을 넘을 수 있어 그리드는 스크롤, [전체 저장]은 하단 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          {data ? (
            <>
              <h1 className="truncate text-xl font-bold text-heading">{data.eventName}</h1>
              {hasPhotos ? (
                <>
                  <p className="mt-1 text-[13px] text-muted">{countText}</p>
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
                </>
              ) : (
                <EmptyState
                  title="아직 볼 수 있는 사진이 없어요"
                  description={
                    linkedNames.length > 0 ? (
                      <>
                        선생님이 사진을 공개하면
                        <br />
                        여기에서 볼 수 있어요.
                      </>
                    ) : (
                      // 미연결(승인 후 기본 경로 §2) — 공통 사진만 보이는 상태임을 안내
                      <>
                        선생님이 아이를 연결하면
                        <br />
                        아이 사진을 함께 볼 수 있어요.
                      </>
                    )
                  }
                />
              )}
            </>
          ) : (
            <LoadState
              loading={photosApi.loading}
              error={photosApi.error}
              loadingText="사진을 불러오는 중…"
              onRetry={photosApi.refetch}
              unauthorizedTo="/login"
              notFoundTo={`/parent/groups/${groupId}`}
              notFoundLabel="모임으로"
            />
          )}
        </div>

        {data && hasPhotos && (
          <div className="px-5 pb-safe-9 pt-4">
            <Button
              fullWidth
              className="gap-1.5"
              disabled={downloading}
              onClick={handleDownloadAll}
            >
              {downloading ? (
                '준비 중…'
              ) : (
                <>
                  <IconDownload size={18} />
                  전체 저장
                </>
              )}
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
