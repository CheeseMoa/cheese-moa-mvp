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
 * 공개 직전 최종 확인: 앨범 단위 통계 2칸 + 남은 검토 구획 + 학부모 뷰 프리뷰(08과 같은 앨범 카드
 * 그리드, CHMO-346) + [공개하기]. 공개는 되돌리기 어려운 외부 노출이라 항상 확인 다이얼로그로 받는다.
 * 성공 시 05 모임 상세로 복귀(거기서 '공개 완료' 배지·학부모 공유 진입이 보인다).
 *
 * 공개 게이트(CHMO-488 — 2026-07-28 정책 변경): **전량 검토 완료가 하드 게이트**다.
 * 인물·공통 앨범에 미검토 사진이 1장이라도 남으면 [공개하기]를 잠근다(종전의 경고 후 ?force=true
 * 강행·409 자동 재시도는 폐기). 판정 범위가 인물·공통뿐인 이유는 특수 앨범(분류 애매·품질 제외)엔
 * 검토 UI가 아예 없어(CHMO-357) 게이트에 넣으면 영영 공개할 수 없는 이벤트가 생기기 때문이다.
 * 미리보기도 **발행 대상(전 사진 검토 완료)만** 담는다 — 검수하다 만 앨범은 공개해도 나가지 않아
 * "학부모가 볼 화면"에 섞이면 거짓이 된다. 그래서 검토 범례(점선/갈색)도 없다.
 *
 * 진입은 08 [공개 전 요약보기] 외에 **09에서 직행**도 있다(CHMO-521) — 마지막 앨범을 검토
 * 완료하면 다음 차례가 공개라 여기로 온다. 그 사람은 특수 앨범을 검토 동선에서 한 번도 못
 * 봤으므로(CHMO-357), 미리보기 아래에 "그 앨범들은 공개 대상이 아니다"를 이름·장수로 밝힌다.
 *
 * 정보 재설계(CHMO-531) — 화면이 같은 사실을 세 번 말하고 있었다:
 * 종전 통계 3칸 중 `공개할 앨범`과 `검토 N/M`의 분자는 **같은 수**였고(둘 다 검토 완료된
 * 인물·공통), 거기서 남은 수를 뺄셈해야 했으며, 그 뺄셈 결과를 아래 안내가 또 말했다.
 * 그래서 ① 통계를 **앨범 단위 2칸**으로 줄여 `공개될 앨범 + 검토 남음 = 전체`가 눈으로 더해지게 하고
 * ② 이벤트 총 사진 수는 부제로 내리고(공개될 장수가 아닌 값이 가장 큰 자리를 차지하고 있었다 —
 * 정확한 발행 장수는 사진이 앨범과 다대다라 앨범별 합으로 못 센다. BE `publishablePhotoCount`
 * (CHMO-505) 후 전환) ③ 막고 있는 앨범을 **이름 나열이 아니라 08과 같은 카드**로 보여준다:
 * 아직 이름을 안 붙인 인물(`인물 5`)은 텍스트로 누군지 알 수 없어 커버(얼굴)가 유일한 단서이고,
 * 카드를 누르면 그 앨범 검토(09)로 가 `14 → 09 → … → 14` 고리가 닫힌다(CHMO-521과 한 짝).
 * 게이트 문장은 하단 [공개하기] 바로 위 — 스크롤을 내려도 잠긴 이유가 버튼 옆에 남는다.
 *
 * 이벤트 이름이 큰 자리를 갖는다(CHMO-531) — 종전엔 `공개 요약`이라는 **화면 종류명**이 큰 제목이고
 * 이름은 회색 부제에 있었다. 05·08·09가 전부 고유명사(모임명·이벤트명·앨범명)를 큰 자리에 두는데
 * 14만 예외였다. 08처럼 헤더로 올리지 않고 05·09처럼 본문 큰 제목으로 둔 이유는 둘이다:
 * 헤더는 한 줄이라 긴 이름이 잘리고(여기선 곁에 붙는 컨트롤이 없어 2줄까지 쓸 수 있다),
 * 08과 달리 하단 [공개하기]가 늘 붙어 있어 스크롤로 제목이 사라져도 화면의 정체가 흔들리지 않는다.
 * 스크롤로 이름이 안 보이는 구간은 확인 다이얼로그가 이름을 되짚어 메운다.
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
  // 공개되지 않는 앨범(사진 있는 특수 앨범, CHMO-521) — 미리보기와 같은 순서로 늘어놓는다
  const excludedAlbums = summary ? sortAlbumsForDisplay(summary.excludedAlbums) : []
  // 미검토 구획·게이트 문장은 공개 전에만 — 게이트 이전에 force로 나간 과거 데이터에
  // "공개할 수 없어요"라고 안내하면 거짓이 된다(공개는 이미 끝났다)
  const showBlocking = hasUnreviewed && !published
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
      {/* 08은 스스로를 '이벤트 상세'라 부르지 않는다(헤더가 이벤트명 — CHMO-522).
          돌아가는 곳을 그 화면의 내용으로 가리킨다 */}
      <Header backTo={eventPath} backLabel="앨범" backDisabled={publishing} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 미리보기가 프레임(844)을 넘을 수 있어 본문은 스크롤, 하단 [공개하기]는 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          {summary && event ? (
            <>
              {/* 곁에 붙는 컨트롤이 없어 이름이 전폭을 쓴다 — 05·09의 truncate 대신 2줄 클램프
                  (AlbumCard 이름 규칙과 같다, CHMO-354). 화면 종류명은 부제로 내려간다 */}
              <h1 className="line-clamp-2 text-xl font-bold text-heading">{event.name}</h1>
              <p className="mt-1 text-[13px] text-muted">공개 요약 · 사진 {summary.photoCount}장</p>

              {/* 통계 2칸(CHMO-531) — 둘 다 **앨범 단위**라 `공개될 + 남음 = 전체`가 눈으로 더해진다.
                  검토할 앨범이 아예 없으면(인물·공통 0개) 두 칸 다 공허해 통째로 걷는다 —
                  그 상태의 설명은 아래 빈 상태 문구가 맡는다 */}
              {summary.reviewableAlbumCount > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <StatCard
                    value={String(summary.previewAlbums.length)}
                    label={published ? '공개된 앨범' : '공개될 앨범'}
                  />
                  {/* 남은 게 없을 때 수를 또 쓰지 않는다 — `검토 완료 N`은 왼쪽 칸과 같은 수다(같은 집합) */}
                  {hasUnreviewed ? (
                    <StatCard value={String(blockingAlbums.length)} label="검토 남음" />
                  ) : (
                    <StatCard value="완료" label="검토" />
                  )}
                </div>
              )}

              {/* 공개를 막는 앨범(CHMO-531) — 종전엔 `인물 2 1장 · 인물 4 3장 · …` 한 줄 나열이었다.
                  숫자 둘이 붙어 오독되고("인물 21장"), `1장`이 남은 장수인지 전체 장수인지 모르고,
                  무엇보다 아직 이름을 안 붙인 인물은 텍스트로 누군지 알 수 없다.
                  카드로 바꾸면 커버(얼굴)가 그 답을 하고, 탭이 검토로 가는 문이 된다 */}
              {showBlocking && (
                <section className="mt-6">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-[12px] tracking-[0.06em] text-muted">검토가 남았어요</h2>
                    {/* 14는 여태 무동작 프리뷰였다 — 카드가 눌린다는 사실을 한 번 알린다 */}
                    <span className="text-[11px] text-muted">눌러서 이어하기</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2.5">
                    {blockingAlbums.map((album) => (
                      <AlbumCard
                        key={album.id}
                        album={album}
                        coverUrl={album.coverThumbnailUrl ?? undefined}
                        // 계약상 optional이라 값이 없으면 '0장 남음' 거짓말 대신 기본 메타(전체 장수)로 둔다
                        metaText={
                          album.unreviewedPhotoCount === undefined
                            ? undefined
                            : `${album.unreviewedPhotoCount}장 남음`
                        }
                        onClick={() => navigate(`${eventPath}/albums/${album.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 섹션 라벨이 문장인 이유 — 위 통계 칸이 이미 `공개될 앨범 N`이라 명사를 반복하면
                  같은 말이 두 번이다. 08 하단 구획(`공개해도 학부모에게 안 보여요`)과 같은 결 */}
              <h2 className="mt-6 text-[12px] tracking-[0.06em] text-muted">
                {published ? '학부모에게 이렇게 보여요' : '공개하면 이렇게 보여요'}
              </h2>
              {hasVisiblePhotos ? (
                // 08과 같은 앨범 카드 — onClick 없이 순수 프리뷰(CHMO-346).
                // 검토 범례는 없다(CHMO-488): 여기 오는 앨범은 전부 검토 완료라 테두리가 한 종류뿐이고,
                // 아직 검토 중인 앨범은 위 구획이 카드로 짚어 준다
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

              {/* 공개되지 않는 앨범 고지(CHMO-521) — 특수 앨범은 검토 동선에 한 번도 등장하지
                  않아(CHMO-357) 검토를 다 끝낸 사람에겐 그 사진들의 행방이 사라진다. 미리보기
                  '공개될 것' 바로 다음에 '안 나가는 것'을 붙여 답한다.
                  카드가 아닌 문장인 이유는 CHMO-347 — 미리보기 그리드는 공개 대상만 담는다.
                  시제 중립('공개되지 않아요')이라 공개 전·후 어느 쪽에서 봐도 맞다 */}
              {excludedAlbums.length > 0 && (
                <div className="mt-3 rounded-xl bg-surface px-4 py-3.5">
                  <p className="text-xs font-bold leading-normal text-heading">
                    학부모에게는 인물·공통 앨범만 보여요
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    {/* 가운뎃점은 앨범명 안의 공백과 섞여 한 덩어리로 읽힌다 — 쉼표로 끊는다 */}
                    {excludedAlbums
                      .map((album) => `${album.name} ${album.photoCount}장`)
                      .join(', ')}
                    은 공개되지 않아요.
                  </p>
                </div>
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
              notFoundLabel="모임으로"
            />
          )}
        </div>

        {summary && event && (
          <div className="px-5 pb-safe-9 pt-4">
            {/* 잠긴 이유는 버튼 옆에 산다 — 미검토 구획은 스크롤 위로 밀려나도 이 줄은 늘 보인다 */}
            {showBlocking && (
              <p className="mb-2.5 text-center text-xs text-muted">
                앨범 {blockingAlbums.length}개를 마저 검토하면 공개할 수 있어요
              </p>
            )}
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
        // 결정하는 순간에 이름을 되짚어 준다(CHMO-531) — 본문 큰 제목은 스크롤로 사라져 있을 수 있고,
        // 모임에 이벤트가 여럿이면 "어느 이벤트였지"를 확인할 마지막 자리가 여기다.
        // 따옴표·'을' 고정은 09 검토 완료/앨범 삭제 다이얼로그와 같은 꼴
        title={`'${event?.name ?? '이 이벤트'}'을 공개할까요?`}
        description={
          // 미검토 분기는 없다 — 게이트에 걸리면 버튼 자체가 잠겨 여기까지 오지 못한다(CHMO-488).
          // 보일 사진 0장이 유일하게 남은 경고 — "사진을 볼 수 있어요"라고 안내하면 거짓이 된다
          !hasVisiblePhotos
            ? '지금 공개하면 학부모에게 보이는 사진이 없어요. 사진을 인물·공통 앨범으로 정리한 뒤 공개하는 걸 권해요.'
            : `앨범 ${summary?.previewAlbums.length ?? 0}개를 학부모가 공유 링크로 볼 수 있어요.`
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
 * 요약 통계 카드 — 큰 수치 + 작은 라벨(2열 그리드).
 * 미검토가 남아도 수치를 warn 색으로 물들이지 않는다 — 잘못된 상태가 아니라 진행 중인 상태고,
 * 왜 공개가 잠겼는지는 아래 구획이 앨범 카드로 짚어 준다.
 */
function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface px-1 py-3.5">
      <span className="text-base font-bold tabular-nums text-accent">{value}</span>
      <span className="mt-0.5 whitespace-nowrap text-[11px] text-muted">{label}</span>
    </div>
  )
}
