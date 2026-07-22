import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { AlbumCard, Button, ConfirmDialog, Header, LoadState, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { ApiRequestError } from '../api/client'
import { getEvent, getReviewSummary, publishEvent } from '../api/events'
import { sortAlbumsForDisplay } from '../lib/albumSort'
import { cx } from '../lib/cx'

/**
 * 14. 공개 요약(구 '공개 전 검수' — CHMO-398) · node 211:1723 · GET /events/:id/review-summary · POST /events/:id/publish
 * 공개 직전 최종 확인: 요약 통계(사진/앨범/검토한 앨범 — 분류 애매는 공개와 무관해 비노출(CHMO-347),
 * 검토 진척은 검토 행위 단위인 앨범으로 정산(CHMO-357)) + 학부모 뷰 프리뷰(08과 같은 앨범 카드 그리드 — CHMO-346) + [공개하기].
 * 공개는 되돌리기 어려운 외부 노출이라 항상 확인 다이얼로그로 받는다 — 미검토 앨범이 있으면
 * 경고 문구 + ?force=true로 공개(미검토 사진은 공개 후에도 뷰어 비노출). 성공 시 05 모임 상세로 복귀
 * (거기서 '공개 완료' 배지·학부모 공유 진입이 보인다). 이벤트명은 부제용으로 /events/:id에서 함께 읽는다.
 *
 * 재공개(CHMO-324·265): 발행은 [공개하기]로만 일어난다(검토 완료는 표시일 뿐). published여도
 * 발행 대기(pendingPublishCount)가 있으면 버튼을 다시 열고, 발행 시 그 시점 전 사진 검토 완료된
 * 인물·공통 앨범의 사진이 추가로 나간다(서버 게이트 — 검수하다 만 앨범은 통째로 대기).
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
  const unreviewedAlbumCount = summary
    ? summary.reviewableAlbumCount - summary.reviewedAlbumCount
    : 0
  const hasUnreviewed = unreviewedAlbumCount > 0
  // 뷰어 노출 앨범(검토 완료 사진 보유 + person/common) 존재 여부 — 0개면 공개해도 학부모에겐 빈 이벤트
  const hasVisiblePhotos = !!summary && summary.previewAlbums.length > 0
  // 재공개 게이트(CHMO-324·265): 공개 후 검토를 마친 사진(발행 대기)이 있으면 [공개하기]를 다시 연다.
  // 발행 대기 수는 서버 파생값 — 검토만으로는 노출되지 않고 발행 액션이 있어야 학부모에게 나간다
  const pendingPublishCount = event?.pendingPublishCount ?? 0
  const republishable = published && pendingPublishCount > 0
  // 서버 정책과 동일: review/ready(첫 공개) 또는 published+발행 대기(재공개)에서만 공개 가능 —
  // empty/analyzing 딥링크(고아 사진 한계 — api-spec 기록)에선 눌리면 항상 400이라 버튼을 잠근다
  const publishable = event?.status === 'review' || event?.status === 'ready' || republishable
  const canPublish = !!summary && summary.photoCount > 0 && publishable && !publishing

  const handlePublish = async () => {
    if (publishing) return
    setPublishing(true)
    await mutate(() => publishWithForceRetry(eventId, hasUnreviewed), {
      onSuccess: () => {
        setConfirmOpen(false)
        toast.show(republishable ? '🧀 새로 검토한 사진을 공개했어요' : '🧀 이벤트를 공개했어요')
        navigate(`/groups/${groupId}`)
      },
      onError: (msg) => {
        setConfirmOpen(false)
        toast.show(msg)
        // 다른 멤버가 먼저 공개했거나(400 "이미 공개") 상태가 그새 바뀐 실패 — 재조회 없이는
        // stale 화면이 활성 [공개하기]로 남아 같은 400을 무한 반복한다(권한 등급 없음 = 동시 작업이 정상)
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

              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatCard value={String(summary.photoCount)} label="사진" />
                <StatCard value={String(summary.albumCount)} label="앨범" />
                <StatCard
                  value={`${summary.reviewedAlbumCount}/${summary.reviewableAlbumCount}`}
                  label="검토한 앨범"
                  warn={hasUnreviewed}
                />
              </div>

              {hasUnreviewed && (
                <p className="mt-3 text-xs leading-normal text-warn">
                  아직 검토하지 않은 앨범이 {unreviewedAlbumCount}개 있어요. 검토 안 된 사진은
                  공개해도 학부모에게 보이지 않아요.
                </p>
              )}

              <h2 className="mt-6 text-[13px] font-bold text-muted">미리보기</h2>
              {hasVisiblePhotos ? (
                <>
                  {/* 08과 같은 앨범 카드(앨범명·검토 테두리) — onClick 없이 순수 프리뷰(CHMO-346) */}
                  <div className="mt-2 grid grid-cols-3 gap-2.5">
                    {sortAlbumsForDisplay(summary.previewAlbums).map((album) => (
                      <AlbumCard
                        key={album.id}
                        album={album}
                        coverUrl={album.coverThumbnailUrl ?? undefined}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted">
                    테두리: 회색 점선=미검토 · 갈색=검토완료
                  </p>
                </>
              ) : (
                <p className="mt-2 rounded-xl bg-surface px-4 py-8 text-center text-[13px] leading-relaxed text-muted">
                  공개하면 보일 사진이 아직 없어요.
                  <br />
                  사진을 검토 완료하고 인물·공통 앨범으로
                  <br />
                  정리하면 학부모에게 보여요.
                </p>
              )}

              {published &&
                (republishable ? (
                  <p className="mt-4 text-xs leading-normal text-warn">
                    발행 대기 {pendingPublishCount}장 — 공개 후 검토를 마친 사진이에요.
                    [공개하기]를 다시 눌러야 학부모에게 보여요.
                  </p>
                ) : (
                  <p className="mt-4 text-xs leading-normal text-muted">
                    이미 공개된 이벤트예요. 학부모가 공유 링크로 볼 수 있어요.
                  </p>
                ))}
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
              {published && !republishable ? '공개 완료됨' : '공개하기'}
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
          // 보일 사진 0장이 가장 강한 경고 — "사진을 볼 수 있어요"라고 안내하면 거짓이 된다
          !hasVisiblePhotos
            ? '지금 공개하면 학부모에게 보이는 사진이 없어요. 사진을 검토 완료하고 인물·공통 앨범으로 정리한 뒤 공개하는 걸 권해요.'
            : republishable
              ? hasUnreviewed
                ? `발행 대기 사진 ${pendingPublishCount}장을 학부모에게 추가로 공개해요. 검토 안 한 앨범 ${unreviewedAlbumCount}개의 사진은 검토 전까지 보이지 않아요.`
                : `발행 대기 사진 ${pendingPublishCount}장을 학부모에게 추가로 공개해요.`
              : hasUnreviewed
                ? `공개하면 학부모가 공유 링크로 볼 수 있어요. 검토 안 한 앨범 ${unreviewedAlbumCount}개의 사진은 검토 전까지 보이지 않아요.`
                : '공개하면 학부모가 공유 링크로 사진을 볼 수 있어요.'
        }
        confirmLabel="공개하기"
        onConfirm={handlePublish}
        onClose={() => setConfirmOpen(false)}
      />
    </PhoneShell>
  )
}

/**
 * 공개 POST. 미검토 앨범이 있으면 force로 공개(경고는 이미 다이얼로그로 고지).
 * 409 코드는 BE PUBLISH409를 errors.ts가 HAS_UNREVIEWED_PHOTOS로 정규화한 것(CHMO-324).
 * all-reviewed로 보였는데 그새 미검토 사진이 생긴 레이스(409 HAS_UNREVIEWED_PHOTOS)면
 * 사용자가 이미 공개에 동의했으니 force로 한 번 재시도한다(미검토 사진은 어차피 뷰어 비노출).
 * force 판정이 앨범 단위(인물·공통)라 특수 앨범에만 미검토 사진이 남으면 force 없이 나가는데,
 * BE가 사진 단위로 409를 주더라도 같은 재시도가 받아준다(CHMO-357).
 */
async function publishWithForceRetry(eventId: string, force: boolean): Promise<void> {
  try {
    await publishEvent(eventId, { force })
  } catch (err) {
    // code까지 확인 — 다른 의미의 409가 추가돼도 force로 삼키지 않고 사용자에게 그대로 보여준다
    if (
      !force &&
      err instanceof ApiRequestError &&
      err.status === 409 &&
      err.code === 'HAS_UNREVIEWED_PHOTOS'
    )
      return publishEvent(eventId, { force: true })
    throw err
  }
}

interface StatCardProps {
  value: string
  label: string
  /** 미검토 앨범이 남았을 때 검토 수치를 warn 색으로 강조 */
  warn?: boolean
}

/** 요약 통계 카드 — 큰 수치 + 작은 라벨(4열 그리드) */
function StatCard({ value, label, warn }: StatCardProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface px-1 py-3.5">
      <span className={cx('text-base font-bold tabular-nums', warn ? 'text-warn' : 'text-accent')}>
        {value}
      </span>
      <span className="mt-0.5 whitespace-nowrap text-[11px] text-muted">{label}</span>
    </div>
  )
}
