import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { AlbumCard, Button, ConfirmDialog, Header, LoadState, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { getEvent, getReviewSummary, publishEvent } from '../api/events'
import { sortAlbumsForDisplay } from '../lib/albumSort'

/**
 * 14. 공개 요약(구 '공개 전 검수' — CHMO-398) · node 211:1723 · GET /events/:id/review-summary · POST /events/:id/publish
 * 공개 직전 최종 확인: 요약 통계(사진/앨범/검토한 앨범 — 분류 애매는 공개와 무관해 비노출(CHMO-347),
 * 검토 진척은 검토 행위 단위인 앨범으로 정산(CHMO-357)) + 학부모 뷰 프리뷰(08과 같은 앨범 카드 그리드 — CHMO-346) + [공개하기].
 * 공개는 되돌리기 어려운 외부 노출이라 항상 확인 다이얼로그로 받는다. 성공 시 05 모임 상세로 복귀
 * (거기서 '공개 완료' 배지·학부모 공유 진입이 보인다). 이벤트명은 부제용으로 /events/:id에서 함께 읽는다.
 *
 * 공개 게이트(CHMO-488 — 2026-07-28 정책 변경): **전량 검토 완료가 하드 게이트**다.
 * 인물·공통 앨범에 미검토 사진이 1장이라도 남으면 [공개하기]를 잠그고 남은 앨범을 이름으로 안내한다
 * (종전의 경고 후 ?force=true 강행·409 자동 재시도는 폐기). 판정 범위가 인물·공통뿐인 이유는
 * 특수 앨범(분류 애매·품질 제외)엔 검토 UI가 아예 없어(CHMO-357) 게이트에 넣으면 영영 공개할 수
 * 없는 이벤트가 생기기 때문이다. 재공개(CHMO-324·265)도 함께 사라졌다 — 업로드가 이벤트당
 * 1회(CHMO-486)고 전량 검토 후에만 공개되니 공개 뒤에 발행 대기가 생길 경로가 없다.
 * 미리보기도 **발행 대상(전 사진 검토 완료)만** 담는다(CHMO-488) — 검수하다 만 앨범은 공개해도
 * 나가지 않아 "학부모가 볼 화면"에 섞이면 거짓이 된다. 그래서 검토 범례(점선/갈색)도 없다.
 */
export function PublishReviewPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const eventApi = useApi(`event:${eventId}`, (signal) => getEvent(eventId, signal))
  const summaryApi = useApi(`review-summary:${eventId}`, (signal) =>
    getReviewSummary(eventId, signal),
  )

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const mutate = useMutation()

  const eventPath = `/groups/${groupId}/events/${eventId}`
  const event = eventApi.data
  const summary = summaryApi.data
  const published = event?.status === 'published'
  // 공개를 막는 앨범(인물·공통 중 미검토 잔여) — 서버 409 판정과 같은 범위라 화면 잠금과 서버가 어긋나지 않는다
  const blockingAlbums = summary ? sortAlbumsForDisplay(summary.unreviewedAlbums) : []
  const hasUnreviewed = blockingAlbums.length > 0
  // 발행 대상 앨범(전 사진 검토 완료 + person/common) 존재 여부 — 0개면 공개해도 학부모에겐 빈 이벤트
  const hasVisiblePhotos = !!summary && summary.previewAlbums.length > 0
  // 서버 정책과 동일: review/ready에서만 공개 가능 — published 재진입은 '공개 완료됨'으로 잠그고
  // (재공개 경로 폐지 — CHMO-488), empty/analyzing 딥링크(고아 사진 한계 — api-spec 기록)도
  // 눌리면 항상 400이라 버튼을 잠근다
  const publishable = event?.status === 'review' || event?.status === 'ready'
  // 미검토가 남으면 하드 게이트 — 서버가 어차피 409를 주므로 화면에서 먼저 잠근다
  const canPublish =
    !!summary && summary.photoCount > 0 && publishable && !hasUnreviewed && !publishing

  const handlePublish = async () => {
    if (publishing) return
    setPublishing(true)
    await mutate(() => publishEvent(eventId), {
      onSuccess: () => {
        setConfirmOpen(false)
        toast.show('🧀 이벤트를 공개했어요')
        navigate(`/groups/${groupId}`)
      },
      onError: (msg) => {
        setConfirmOpen(false)
        toast.show(msg)
        // 다른 멤버가 먼저 공개했거나(400 "이미 공개") 그새 미검토가 생긴 실패(409 게이트) — 재조회 없이는
        // stale 화면이 활성 [공개하기]로 남아 같은 오류를 무한 반복한다(권한 등급 없음 = 동시 작업이 정상)
        eventApi.refetch()
        summaryApi.refetch()
        setPublishing(false)
      },
    })
  }

  const bothLoading = eventApi.loading || summaryApi.loading
  const anyError = summaryApi.error ?? eventApi.error

  return (
    <PhoneShell>
      <Header backTo={eventPath} backLabel="이벤트 상세" backDisabled={publishing} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 미리보기가 프레임(844)을 넘을 수 있어 본문은 스크롤, 하단 [공개하기]는 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          {summary && event ? (
            <>
              <h1 className="text-xl font-bold text-heading">공개 요약</h1>
              <p className="mt-1 truncate text-[13px] text-muted">
                {event.name} · 공개 직전 최종 확인
              </p>

              {/* 통계 3열(CHMO-488) — 뒤 두 칸은 '학부모에게 나갈 것' 기준으로 맞췄다.
                  첫 칸만 이벤트 총량이라 라벨에 '전체'를 박아 범위를 드러낸다: 특수 앨범(분류 애매·품질
                  제외) 사진이 섞여 있어 공개될 장수가 아니고, 정확한 발행 장수는 사진이 앨범과 다대다라
                  앨범별 장수 합으로 셀 수 없다(겹친 사진 중복) — BE `publishablePhotoCount`(CHMO-505) 후 전환 */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatCard value={String(summary.photoCount)} label="전체 사진" />
                <StatCard
                  value={String(summary.previewAlbums.length)}
                  label={published ? '공개한 앨범' : '공개할 앨범'}
                />
                <StatCard
                  value={`${summary.reviewedAlbumCount}/${summary.reviewableAlbumCount}`}
                  label="검토"
                />
              </div>

              {/* 공개 게이트 안내(CHMO-488) — [공개하기]가 잠긴 이유와 남은 앨범을 이름으로 짚어 준다.
                  뒤로가기(이벤트 상세)가 곧 검토 동선이라 별도 CTA는 두지 않는다.
                  이미 공개된 이벤트에선 숨긴다 — 게이트 이전에 force로 나간 과거 데이터에
                  "공개할 수 없어요"라고 안내하면 거짓이 된다(공개는 이미 끝났다) */}
              {hasUnreviewed && !published && (
                <div className="mt-3 rounded-xl bg-surface px-4 py-3.5">
                  {/* 경고색(warn)을 쓰지 않는다 — 위험한 상태가 아니라 남은 할 일 안내다.
                      warn은 되돌릴 수 없는 동작(삭제 등)에만 남긴다 */}
                  <p className="text-xs font-bold leading-normal text-heading">
                    검토를 모두 마쳐야 공개할 수 있어요 — {blockingAlbums.length}개 앨범이 남았어요
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    {blockingAlbums
                      .map((album) => `${album.name} ${album.unreviewedPhotoCount ?? 0}장`)
                      .join(' · ')}
                  </p>
                </div>
              )}

              <h2 className="mt-6 text-[12px] tracking-[0.06em] text-muted">미리보기</h2>
              {hasVisiblePhotos ? (
                // 08과 같은 앨범 카드 — onClick 없이 순수 프리뷰(CHMO-346).
                // 검토 범례는 없다(CHMO-488): 여기 오는 앨범은 전부 검토 완료라 테두리가 한 종류뿐이고,
                // 아직 검토 중인 앨범은 위 게이트 안내가 이름으로 짚어 준다
                <div className="mt-2 grid grid-cols-3 gap-2.5">
                  {sortAlbumsForDisplay(summary.previewAlbums).map((album) => (
                    <AlbumCard
                      key={album.id}
                      album={album}
                      coverUrl={album.coverThumbnailUrl ?? undefined}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-xl bg-surface px-4 py-8 text-center text-[13px] leading-relaxed text-muted">
                  공개하면 보일 사진이 아직 없어요.
                  <br />
                  사진을 검토 완료하고 인물·공통 앨범으로
                  <br />
                  정리하면 학부모에게 보여요.
                </p>
              )}

              {published && (
                <p className="mt-4 text-xs leading-normal text-muted">
                  이미 공개된 이벤트예요. 학부모가 공유 링크로 볼 수 있어요.
                </p>
              )}
            </>
          ) : (
            <LoadState
              loading={bothLoading}
              error={anyError}
              loadingText="요약을 불러오는 중…"
              onRetry={() => {
                eventApi.refetch()
                summaryApi.refetch()
              }}
              unauthorizedTo="/login"
              // 여기 404 = 이벤트 자체가 사라진 것 — 이벤트 상세로 보내면 또 404라 부모(모임)로
              notFoundTo={`/groups/${groupId}`}
              notFoundLabel="모임 상세로"
            />
          )}
        </div>

        {summary && event && (
          <div className="px-5 pb-safe-9 pt-4">
            <Button fullWidth disabled={!canPublish} onClick={() => setConfirmOpen(true)}>
              {published ? '공개 완료됨' : '공개하기'}
            </Button>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmOpen}
        busy={publishing}
        busyLabel="공개 중…"
        title="이 이벤트를 공개할까요?"
        description={
          // 미검토 분기는 없다 — 게이트에 걸리면 버튼 자체가 잠겨 여기까지 오지 못한다(CHMO-488).
          // 보일 사진 0장이 유일하게 남은 경고 — "사진을 볼 수 있어요"라고 안내하면 거짓이 된다
          !hasVisiblePhotos
            ? '지금 공개하면 학부모에게 보이는 사진이 없어요. 사진을 인물·공통 앨범으로 정리한 뒤 공개하는 걸 권해요.'
            : '공개하면 학부모가 공유 링크로 사진을 볼 수 있어요.'
        }
        confirmLabel="공개하기"
        onConfirm={handlePublish}
        onClose={() => setConfirmOpen(false)}
      />
    </PhoneShell>
  )
}

interface StatCardProps {
  value: string
  label: string
}

/**
 * 요약 통계 카드 — 큰 수치 + 작은 라벨(3열 그리드).
 * 미검토가 남아도 수치를 warn 색으로 물들이지 않는다 — 잘못된 상태가 아니라 진행 중인 상태고,
 * 왜 공개가 잠겼는지는 바로 아래 안내가 앨범 이름으로 짚어 준다.
 */
function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface px-1 py-3.5">
      <span className="text-base font-bold tabular-nums text-accent">{value}</span>
      <span className="mt-0.5 whitespace-nowrap text-[11px] text-muted">{label}</span>
    </div>
  )
}
