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
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { usePhotoSave, photoSaveLabel } from '../hooks/usePhotoSave'
import { listGroups } from '../api/groups'
import { getParentEventPhotos } from '../api/events'
import { cx } from '../lib/cx'
import type { ID } from '../types/api'

/**
 * 19. 학부모 사진 그리드 (ACTIVE PARENT) · node 307:27 · CHMO-448
 * GET /events/:id/parent-photos — 매핑 인물 + 공통, published만, 플랫(앨범 계층 없음 §3).
 * 아이가 안 나온 이벤트·미연결은 서버가 404로 은닉한다(노출 강화 — 18 목록 필터와 동일 판정,
 * LoadState notFoundTo가 모임으로 되돌린다). 사진 탭 → 공용 라이트박스(개별 저장) ·
 * 선택모드(헤더 [선택]·롱프레스 진입 — 09와 같은 CHMO-243 관용, CHMO-473 추가)로 골라 저장 ·
 * [↓ 전체 저장]/선택 [저장] = 앨범 저장 파이프라인(usePhotoSave, CHMO-473 — ZIP 폐지: iOS는
 * 공유 시트 '이미지 저장'으로 사진 앱 직행, 그 외는 장별 다운로드 → 갤러리 자동 색인). 모임명(뒤로가기
 * 라벨)·자녀 이름은 모임 목록 myMembership에서 — 검토·발행 대기 등 제작자 필드는 화면도 다루지 않는다.
 */
export function ParentEventPhotosPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const groupsApi = useApi('groups', listGroups)
  const photosApi = useApi(`parent-photos:${eventId}`, (signal) =>
    getParentEventPhotos(eventId, signal),
  )
  const save = usePhotoSave()
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<ID>>(new Set())

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

  const toggle = (id: ID) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // 롱프레스(꾹 누르기)로 선택모드 진입 + 해당 사진 선택 — 09와 같은 관용 UX(CHMO-243)
  const enterSelectWith = (id: ID) => {
    setSelectMode(true)
    setSelected(new Set([id]))
  }

  const allSelected = photos.length > 0 && selected.size === photos.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.id)))

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
    // 선택 저장이 준비/대기 중이었다면 폐기 — 전체 저장 버튼이 이어받지 않게
    save.reset()
  }

  const handleSave = (targets: typeof photos) => {
    if (save.state.phase === 'ready') {
      save.shareNext()
      return
    }
    void save.start(targets.map((p) => ({ url: p.downloadUrl, filename: `${p.id}.jpg` })))
  }

  return (
    <PhoneShell>
      <Header
        backTo={`/parent/groups/${groupId}`}
        backLabel={group?.name ?? '모임'}
        right={
          hasPhotos ? (
            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={cx(
                'rounded-full px-3 py-1.5 text-xs font-bold',
                selectMode ? 'bg-surface text-text' : 'bg-primary text-heading',
              )}
            >
              {selectMode ? '취소' : '선택'}
            </button>
          ) : undefined
        }
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 사진이 많아 프레임을 넘을 수 있어 그리드는 스크롤, [전체 저장]은 하단 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          {data ? (
            <>
              <div className="flex items-center gap-2.5">
                <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-heading">
                  {data.eventName}
                </h1>
                {selectMode && (
                  <div className="flex flex-none items-center gap-2">
                    <span className="text-[13px] font-medium text-muted">
                      {selected.size}장 선택
                    </span>
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-bold text-accent"
                    >
                      {allSelected ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                )}
              </div>
              {hasPhotos ? (
                <>
                  <p className="mt-1 text-[13px] text-muted">{countText}</p>
                  {/* 재배포 금지 배너(CHMO-478)는 걷어냈다(2026-07-29) — 아이 사진을 보러 온
                      학부모에게 첫 화면부터 "당신이 위법할 수 있다"고 경고하는 꼴이라 인상이 나빴다.
                      같은 의무는 이용약관 제14조(학부모 회원의 이용 범위)에 그대로 남아 있다 */}
                  <div className="mt-4">
                    <PhotoGrid>
                      {photos.map((photo, i) => (
                        <PhotoTile
                          key={photo.id}
                          src={photo.thumbnailUrl}
                          selectable={selectMode}
                          selected={selected.has(photo.id)}
                          // 탭: 선택모드=선택 토글 · 일반 모드=라이트박스 크게 보기
                          onClick={selectMode ? () => toggle(photo.id) : () => setViewIndex(i)}
                          // 롱프레스: 일반 모드에서 꾹 누르면 선택모드 진입 + 이 사진 선택(CHMO-243)
                          onLongPress={selectMode ? undefined : () => enterSelectWith(photo.id)}
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
              className="gap-1.5 whitespace-nowrap"
              disabled={save.busy || (selectMode && selected.size === 0)}
              onClick={() =>
                handleSave(selectMode ? photos.filter((p) => selected.has(p.id)) : photos)
              }
            >
              {photoSaveLabel(save.state) ?? (
                <>
                  <IconDownload size={18} />
                  {selectMode
                    ? selected.size > 0
                      ? `${selected.size}장 저장`
                      : '저장'
                    : '전체 저장'}
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

      {save.dialog}
    </PhoneShell>
  )
}
