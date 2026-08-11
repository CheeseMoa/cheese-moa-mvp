import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlbumSettingsSheet } from '../components/AlbumSettingsSheet'
import { PhoneShell } from '../components/PhoneShell'
import { RenameModal } from '../components/RenameModal'
import {
  AlbumCard,
  Button,
  CoachHint,
  ConfirmDialog,
  EventStatusBadge,
  Header,
  IconPlus,
  LoadState,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { toErrorMessage } from '../api/client'
import { getGroup } from '../api/groups'
import { createPersonAlbum } from '../api/albums'
import { deleteEvent, getEvent, listEventAlbums, renameEvent } from '../api/events'
import { sortAlbumsForDisplay } from '../lib/albumSort'
import { hasSeenCoachHint } from '../lib/onboarding'
import type { Album, AnalysisProgress, EventItem, GroupType } from '../types/api'

/**
 * 이벤트 상세 진입점 — 이벤트 상태로 화면을 분기한다(GET /events/:id).
 * - empty → 06-E 빈 이벤트(node 211:1572): 📷 빈 상태 + [사진 업로드]→06-U
 * - 분석 진행(analyzing 상태, progress non-null, 또는 업로드 직후 킥) → 분석중: 2초 간격
 *   자동 폴링(BE 요청 주기) — 진행률(progress)과 함께 갱신되고, 완료되면 앨범 그리드로 자연
 *   전환. published 이벤트의 사진 추가는 상태 전이 없는 증분 분석이라(CHMO-215·216) progress로
 *   판정하되, 등록 직후의 progress null 공백은 업로드 화면이 넘긴 킥이 메운다(CHMO-443).
 * - 그 외(review/ready/published) → 08 앨범 그리드(EventAlbumGrid, node 211:1619)
 * 어느 상태든 헤더 ⚙ = 이벤트 설정(이름 수정 + 이벤트 삭제 — CHMO-278).
 */
/** 업로드 화면이 navigate state로 넘기는 '분석 시작' 킥(CHMO-443) */
interface AnalysisKick {
  eventId: string
  expected: number
}

export function EventDetailPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const eventApi = useApi(`event:${eventId}`, (signal) => getEvent(eventId, signal))
  const event = eventApi.data
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 업로드 직후 킥(CHMO-443) — 등록 직후엔 AI가 첫 진행률 메시지를 보내기 전이라 progress가
  // 잠깐 null이고, published는 상태 전이도 없어(CHMO-215·216) 단발 조회로는 분석 시작을 알 수
  // 없다. 업로드 화면이 넘긴 킥이 있으면 폴링을 켠다 — photoCount가 기대치에 닿으면 완료로
  // 보고(사진은 분석 커밋 시점에야 반영된다 — 실서버 실측), progress가 먼저 켜지면 그 신호가
  // 이어받는다. 전부 중복 업로드(registeredCount 0)는 기대치가 이미 충족돼 킥이 바로 꺼진다.
  const [kick, setKick] = useState<AnalysisKick | null>(
    () => (location.state as { analysisKick?: AnalysisKick } | null)?.analysisKick ?? null,
  )
  const kickActive =
    kick != null && kick.eventId === eventId && !!event && event.photoCount < kick.expected
  // 분석 진행 판정 — analyzing 상태 또는 progress 존재. published 이벤트는 사진을 추가해도
  // 공개를 유지한 채 증분 분석이 돌아 상태가 안 바뀌고(CHMO-215·216), 상세 응답의 progress
  // (분석 job 중에만 non-null)로만 진행을 알 수 있다 — 로딩바·폴링은 두 경우 모두 켠다.
  const analysisActive =
    !!event && (event.status === 'analyzing' || event.progress != null || kickActive)

  // 킥 안전 종료 — 분석이 실패하면 photoCount가 기대치에 영영 닿지 않으므로(CHMO-218 계열)
  // 30초 뒤엔 킥을 내리고 그리드로 복귀시킨다. 정상 경로는 그 전에 progress가 이어받는다.
  useEffect(() => {
    if (!kick) return
    const timer = setTimeout(() => setKick(null), 30_000)
    return () => clearTimeout(timer)
  }, [kick])
  // 모임 조회는 상태와 무관하게 항상 보낸다(CHMO-612) — 종전엔 뒤로가기 '‹ 모임명'이 필요한
  // 빈/분석중 분기에서만 불렀지만, 08 그리드가 **모임 유형**으로 검토·공개 UI를 가르게 되면서
  // 그리드에도 이 응답이 필요해졌다(앨범 설정 시트의 멤버 연결 섹션도 같은 값을 본다 — CHMO-610).
  // 이벤트 조회와 나란히(마운트 시점) 나가므로 앨범 목록보다 먼저 도착한다 — 카드가 그려질 땐
  // 유형이 정해져 있다.
  const groupApi = useApi(`group:${groupId}`, (signal) => getGroup(groupId, signal))

  // 분석중 자동 폴링 — 2초마다 진행률·상태를 다시 확인하고(BE 요청 주기), 완료되면 앨범
  // 그리드로 자연 전환. 폴링 실패해도 인터벌은 유지되므로 일시적 네트워크 오류는 다음 주기에 회복된다.
  useEffect(() => {
    if (!analysisActive) return
    const timer = setInterval(eventApi.refetch, 2000)
    return () => clearInterval(timer)
  }, [analysisActive, eventApi.refetch])

  // 보조 fetch(모임명)의 401은 ErrorState를 거치지 않아 여기서 직접 복귀시킨다
  // (eventApi 401은 아래 ErrorState unauthorizedTo가 처리)
  if (groupApi.error?.status === 401) return <Navigate to="/login" replace />

  const base = `/groups/${groupId}/events/${eventId}`

  // 08. 이벤트 상세 = 앨범 그리드(검수 허브) — 분석 완료 시 여기로 자연 전환
  if (event && event.status !== 'empty' && !analysisActive) {
    return (
      <EventAlbumGrid
        event={event}
        groupId={groupId}
        groupType={groupApi.data?.groupType}
        onEventUpdated={eventApi.refetch}
      />
    )
  }

  return (
    <PhoneShell>
      <Header
        backTo={`/groups/${groupId}`}
        backLabel={groupApi.data?.name ?? '뒤로'}
        right={event && <EventSettingsButton onClick={() => setSettingsOpen(true)} />}
      />
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-5">
        {event ? (
          <>
            <div className="flex items-center justify-between gap-2.5">
              <h1 className="min-w-0 truncate text-xl font-bold text-text">{event.name}</h1>
              <EventStatusBadge status={event.status} />
            </div>

            {event.status === 'empty' ? (
              <>
                {/* 06-E. 빈 이벤트 — 사진 없는 이벤트의 초기 화면 */}
                <div className="mt-4 flex flex-col items-center rounded-[20px] bg-surface px-8 py-16 text-center">
                  <span aria-hidden className="text-4xl">
                    📷
                  </span>
                  <p className="mt-3 text-sm text-muted">아직 사진이 없어요</p>
                </div>
                <div className="mt-auto pt-6">
                  {/* replace로 들어간다 — 06-U는 히스토리에 남지 않는 '지나가는 화면'이라(CHMO-486
                      내비 관용) 06-E 자리를 대신 차지해야 업로드 후 뒤로가기가 모임 상세로 곧장
                      빠진다. push로 두면 히스토리에 06-E·06-U가 남아 뒤로가기가 두 번 헛돈다 */}
                  <Button fullWidth onClick={() => navigate(`${base}/upload`, { replace: true })}>
                    사진 업로드
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* 분석중 — 2초 자동 폴링(위 effect). 진행률 따라 쥐가 치즈로 다가가고, 완료되면 앨범 그리드로 자연 전환 */}
                <div className="mt-4 flex flex-col items-center rounded-[20px] bg-surface px-6 py-14 text-center">
                  <p className="text-[19px] text-heading">AI가 사진을 분류하고 있어요</p>
                  <ChaseProgress progress={event.progress ?? null} />
                  <p className="mt-4 text-[13px] leading-relaxed text-muted">
                    완료되면 아이별 앨범이 자동으로 열려요.
                    <br />
                    잠시만 기다려 주세요.
                  </p>
                  {/* 폴링 refetch 실패는 stale 데이터 때문에 아래 에러 분기에 못 가므로 여기서 직접 보여준다 */}
                  {eventApi.error ? (
                    <p role="alert" className="mt-4 text-sm text-warn">
                      {toErrorMessage(eventApi.error)}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </>
        ) : (
          <LoadState
            loading={eventApi.loading}
            error={eventApi.error}
            loadingText="이벤트를 불러오는 중…"
            onRetry={eventApi.refetch}
            unauthorizedTo="/login"
            notFoundTo={`/groups/${groupId}`}
            notFoundLabel="모임으로"
          />
        )}
      </main>
      {event && (
        <EventSettings
          event={event}
          groupId={groupId}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onEventUpdated={eventApi.refetch}
        />
      )}
    </PhoneShell>
  )
}

/**
 * 사진 분류 진행률 — 쥐(🐭)가 치즈(🧀)를 쫓아가는 프로그레스 바(CHMO-287).
 * GET /events/:id의 progress를 그대로 그린다(percent 계산은 BE 몫).
 * progress가 아직 null이면(등록 직후 등) 쥐가 트랙 위를 왕복하는 인디터미넌트로 폴백.
 * 쥐 위치·바 너비에 CSS transition을 걸지 않는다 — 타임라인이 멈춘 렌더링 환경
 * (숨김 탭·임베디드 프리뷰)에선 transition이 걸린 속성이 첫 값에 얼어붙어, 폴링으로
 * 스타일이 갱신돼도 화면이 영영 안 움직인다. 진행 위치는 상태라 장식(총총거림)과 달리
 * 어느 환경에서든 즉시 반영돼야 한다.
 */
function ChaseProgress({ progress }: { progress: AnalysisProgress | null }) {
  const percent = progress?.percent
  return (
    <div
      role="progressbar"
      aria-label="사진 분류 진행률"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="mt-6 w-full"
    >
      {/* 추격 무대 — 치즈는 결승점(오른쪽 끝) 고정, 쥐는 percent 위치 */}
      <div className="relative h-9">
        <span aria-hidden className="absolute -right-1.5 bottom-0 text-[26px]">
          🧀
        </span>
        <span
          aria-hidden
          className={`absolute bottom-0 -translate-x-1/2 ${percent == null ? 'animate-chase-roam' : ''}`}
          style={percent == null ? undefined : { left: `${percent}%` }}
        >
          <span className="inline-block animate-chase-scurry text-[26px]">🐭</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-photo">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent ?? 0}%` }} />
      </div>
      {progress ? (
        <p className="mt-3 text-sm font-bold text-heading">
          {progress.percent}%
          <span className="ml-1.5 font-normal text-muted">
            · {progress.processed}/{progress.total}장 분류
          </span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">사진을 살펴보는 중…</p>
      )}
    </div>
  )
}

interface EventAlbumGridProps {
  event: EventItem
  groupId: string
  /** 모임 유형(CHMO-612 · 앨범 설정 시트의 멤버 연결 섹션도 소비 — CHMO-610) — 도착 전(undefined)은 business로 본다(매퍼의 구계약 정규화와 같은 해석) */
  groupType?: GroupType
  /** 이벤트명 수정 후 이벤트 상세 갱신(refetch) */
  onEventUpdated: () => void
}

/**
 * 08. 이벤트 상세 = 앨범 그리드 · node 211:1619
 * 분석 완료 상태의 검수 허브. ① 인물·공통 = 3열 메인 그리드(커버+검토 테두리/배지) ·
 * ② 공개해도 멤버에게 안 보이는 앨범(분류어려움·눈감음·흔들림) = 하단 별도 섹션.
 * 헤더 ⚙ = 이벤트 설정(이름 수정 + 삭제) · 헤더 중앙 타이틀 = 이벤트명(본문 큰 제목 폐지, CHMO-522).
 * 하단 [＋ 사진 추가]→06-U 재업로드(CHMO-606) · [공개 전 요약보기]→14. 앨범 탭 → 09 앨범 상세.
 * 인물 앨범은 카드 이름 줄 탭 = 앨범 설정 시트(이름 수정 + 멤버 연결 — CHMO-400 자리를 CHMO-522가
 * 넓혔다, 09 진입 없이 바로) + 09 앨범 상세 헤더 [✎ 앨범 설정] 병행.
 *
 * **모임 유형 분기(CHMO-612)** — 일반(GENERAL) 모임엔 검수·공개 단계가 없어(ADR 020) 이 화면이
 * 관리 도구가 아니라 구경 화면이 된다: 검토 테두리·배지, [공개 전 요약보기], publish-gate 힌트,
 * 재공개 안내가 전부 빠지고 하단엔 [＋ 사진 추가] 하나만 남는다. 앨범 만들기 타일·⚙ 이벤트
 * 설정·09 진입은 유형과 무관하다(전원 동일 권한이라 막을 이유가 없다).
 */
function EventAlbumGrid({ event, groupId, groupType, onEventUpdated }: EventAlbumGridProps) {
  const navigate = useNavigate()
  const albumsApi = useApi(`event-albums:${event.id}`, (signal) =>
    listEventAlbums(event.id, signal),
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 08에서 바로 손볼 인물 앨범(CHMO-400) — 열릴 때만 시트 마운트(카드마다 대상이 달라 stale 방지)
  const [albumTarget, setAlbumTarget] = useState<Album | null>(null)
  // 빈 앨범 만들기(CHMO-471) — 이름만 받아 사진 0장 인물 앨범을 만든다
  const [createOpen, setCreateOpen] = useState(false)
  // 공개 게이트 힌트 차례 판정(CHMO-578) — album-grid 힌트를 이미 본 계정에만 띄워 한 화면
  // 한 힌트를 지킨다. 마운트 시점에 한 번 읽는다: 같은 방문에서 album-grid 힌트가 '뜰 때'
  // 기록을 남겨도 이 값은 안 바뀌어 두 힌트가 겹치지 않고, 다음 방문부터 이쪽 차례가 된다
  const [gateHintTurn] = useState(() => hasSeenCoachHint('album-grid'))
  // 검수·공개가 있는 유형인가(CHMO-612). 유형 미도착·조회 실패는 business로 본다 —
  // 매퍼가 구계약 응답을 business로 정규화하는 것과 같은 해석이고(types/api.ts), 곁가지 조회
  // 하나가 실패했다고 비즈니스 모임의 공개 동선을 잠그지 않는다
  const business = groupType !== 'general'

  const base = `/groups/${groupId}/events/${event.id}`

  // 표시 정렬은 FE 소유(CHMO-411) — 서버 순서(미검토 우선)는 검토할 때마다 튄다
  const albums = sortAlbumsForDisplay(albumsApi.data ?? [])
  // 08 구획 기준은 "공개하면 학부모에게 나가는가"다(CHMO-523): ① 인물·공통 = 메인 그리드(검수·발행
  // 대상) · ② 분류어려움·눈감음·흔들림 = 하단 별도 섹션(공개해도 학부모 화면에 안 뜬다).
  // 판정은 타입 열거가 아니라 파생 필드 visibleToViewer(person·common만 true — mappers.toAlbum
  // 단일 원천, 14 검토 진척 집계도 같은 필드를 쓴다). 분류어려움을 여기로 내린 건 CHMO-114 반전 —
  // 재분류 대상이라 메인 그리드에 뒀지만, 검토 UI도 발행 대상도 아닌 앨범(CHMO-357)이 검토 테두리·
  // 범례를 공유하는 자리에 섞여 "이것도 검토해야 하나"로 읽혔다. 섹션 안 카드는 전부 점선이다.
  const mainAlbums = albums.filter((a) => a.visibleToViewer !== false)
  const hiddenAlbums = albums.filter((a) => a.visibleToViewer === false)
  // 공개 후 들어온 미검토 사진 수(CHMO-615) — 재공개 안내의 앞 단계다. 공개는 전량 검토가
  // 하드 게이트라(CHMO-488) 공개 시점엔 인물·공통에 미검토가 0장이었으므로, published 이벤트에
  // 남은 미검토는 **공개 뒤에 이어 올린 사진**뿐이다. 범위를 게이트와 같은 인물·공통으로 두고
  // (특수 앨범은 검토 UI가 없어 영영 미검토다 — CHMO-357) `unreviewedPhotoCount`가 없으면
  // 세지 않는다(계약상 optional — 값이 없다고 미검토로 단정하지 않는 reviewFlow와 같은 태도).
  const unreviewedPhotoCount = mainAlbums.reduce((sum, a) => sum + (a.unreviewedPhotoCount ?? 0), 0)

  return (
    <PhoneShell>
      {/* 제목은 헤더 중앙이 맡는다 — 본문 큰 제목과 '이벤트 상세'가 같은 이름을 두 번 말하고
          있었다. 뒤로가기 라벨을 '이벤트 목록'에서 '모임'으로 줄여 중앙 폭을 넓혔다 */}
      <Header
        backTo={`/groups/${groupId}`}
        backLabel="모임"
        title={event.name}
        right={<EventSettingsButton onClick={() => setSettingsOpen(true)} />}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 앨범이 많아 프레임(844)을 넘을 수 있어 그리드는 스크롤, 하단 액션은 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          {/* 데이터가 있으면 refetch 중에도 그리드를 유지한다(09와 동일 구조) — 이름 저장 등
              성공 직후 갱신 때 화면이 로딩으로 갈아끼워져 새로고침처럼 깜빡이지 않게(CHMO-429) */}
          {albumsApi.data === null ? (
            <LoadState
              loading={albumsApi.loading}
              error={albumsApi.error}
              loadingText="앨범을 불러오는 중…"
              onRetry={albumsApi.refetch}
              unauthorizedTo="/login"
              notFoundTo={`/groups/${groupId}`}
              notFoundLabel="모임으로"
            />
          ) : (
            <>
              {/* stale 그리드 위에서 refetch가 실패해도 보이게 — 화면은 유지하고 알림만(09와 동일) */}
              {albumsApi.error && (
                <p role="alert" className="mt-3 text-sm text-warn">
                  {toErrorMessage(albumsApi.error)}
                </p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {mainAlbums.map((album, i) => {
                  const card = (
                    <AlbumCard
                      key={album.id}
                      album={album}
                      coverUrl={album.coverThumbnailUrl ?? undefined}
                      review={business}
                      onClick={() => navigate(`${base}/albums/${album.id}`)}
                      // 인물 앨범만 ✎ — 공통은 고정 라벨이고 연결할 아이도 없다(personId 없음)
                      onSettings={album.type === 'person' ? () => setAlbumTarget(album) : undefined}
                    />
                  )
                  // 코치 힌트(CHMO-565) — 자동 투어를 대신하는 유일한 첫 안내. 앨범이 늘어선
                  // 화면을 처음 만나는 순간이 이 앱의 가장 낯선 지점이다: 사진을 직접 올린
                  // 사람은 분류가 끝나 여기 도착하고, 나중에 합류한 사람도 앨범이 이미 찬 이
                  // 화면을 처음 본다 — 둘 다 "여기서 뭘 해야 하지?"가 같은 자리에서 생긴다.
                  // 첫 카드에만 붙이고, 앨범이 하나도 없으면 안 뜬다(빈 그리드엔 누를 것이 없다).
                  // 문구는 유형 무관 — '아이별'은 유치원 어휘라 등산 모임에선 틀린 말이 된다(CHMO-608 아이→인물)
                  if (i !== 0) return card
                  return (
                    <div key={album.id} className="relative">
                      {card}
                      <CoachHint id="album-grid" className="left-0 top-full mt-1.5 w-max">
                        사진이 인물별로 나뉘었어요.
                        <br />
                        앨범을 눌러 확인해 보세요
                      </CoachHint>
                    </div>
                  )
                })}
                {/* 빈 앨범 만들기(CHMO-471) — 메인 그리드 맨 끝(09-1 "새 앨범" 타일과 같은 자리 관습).
                    AI가 놓친 아이를 먼저 만들어 두고 09-1 [옮기기]로 사진을 모으는 동선 */}
                <CreateAlbumTile onClick={() => setCreateOpen(true)} />
              </div>

              {hiddenAlbums.length > 0 && (
                <section className="mt-6">
                  {/* 비즈니스 라벨이 문장인 이유 — 관리자는 이 앨범들을 지금 이 화면에서 보고
                      있어서 '공개 제외' 같은 명사만으론 누구에게 안 보이는지가 빠진다(CHMO-523).
                      일반 모임엔 공개 단계가 없어 그 문장이 성립하지 않는다(아무도 이 앨범을
                      기다리지 않는다) — 남는 사실은 "AI가 인물로 못 묶은 사진"뿐이라 명사로 줄인다.
                      '학부모'→'멤버'는 CHMO-608 워딩 중립화(관리자/멤버)와 같은 줄 */}
                  <h2 className="text-[12px] tracking-[0.06em] text-muted">
                    {business ? '공개해도 멤버에게 안 보여요' : '분류에서 제외된 사진'}
                  </h2>
                  <div className="mt-2 grid grid-cols-3 gap-2.5">
                    {hiddenAlbums.map((album) => (
                      <AlbumCard
                        key={album.id}
                        album={album}
                        coverUrl={album.coverThumbnailUrl ?? undefined}
                        review={business}
                        onClick={() => navigate(`${base}/albums/${album.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 검토 범례(점선=미검토 · 채운 면=검토완료)는 화면 피드백으로 제거(2026-08-02) —
                  카드의 채운 면/점선 대비(CHMO-531)가 스스로 말한다.
                  앨범이 하나도 없으면(분석 결과 0건) 안내 — 그래도 만들기 타일은 남는다 */}
              {albums.length === 0 && (
                <p className="mt-4 text-sm text-muted">앨범이 아직 없어요.</p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 px-5 pb-safe-9 pt-4">
          {/* 재공개 안내(CHMO-606 — CHMO-488 반전 복원): 공개 후 이어 올린 사진은 두 단계를
              거쳐야 멤버에게 나간다 — ① 검토 → ② [공개하기] 재호출(BE CHMO-324 로직 존치).
              그래서 두 줄이다(CHMO-615): 발행 대기(pendingPublishCount)만 알리면 ①을 아직 안 한
              구간이 통째로 침묵해, 사진을 막 올리고 돌아온 08이 "할 일 없음"처럼 보인다.
              둘 다 있으면 순서대로 함께 뜬다 — 다른 사실이고 할 일도 다르다(검토 vs 공개).
              warn색이 아니라 muted — 잘못된 상태가 아니라 다음 할 일 안내다(빨간 글씨 금지 톤 규칙) */}
          {business &&
            event.status === 'published' &&
            (unreviewedPhotoCount > 0 || (event.pendingPublishCount ?? 0) > 0) && (
              <div className="flex flex-col gap-1 text-center text-xs text-muted">
                {unreviewedPhotoCount > 0 && (
                  <p>공개 후 추가된 사진 {unreviewedPhotoCount}장 · 검토하면 공개할 수 있어요</p>
                )}
                {(event.pendingPublishCount ?? 0) > 0 && (
                  <p>
                    발행 대기 {event.pendingPublishCount}장 · 공개 전 요약보기에서 공개할 수 있어요
                  </p>
                )}
              </div>
            )}
          {/* 재업로드 진입(CHMO-606 — CHMO-486 반전): 분류가 끝난 이벤트에 사진을 이어 올린다.
              replace — 06-U는 히스토리에 남지 않는 지나가는 화면이라(내비 관용) push로 두면
              업로드 완료 replace가 06-U 자리를 08로 바꿔 뒤로가기가 08→08로 한 번 헛돈다.
              일반 모임에선 이게 유일한 CTA라 primary — 색이 위계를 만드는 규칙(CHMO-530)에서
              혼자 남은 secondary는 할 일이 없는 화면처럼 읽힌다 */}
          <Button
            variant={business ? 'secondary' : 'primary'}
            fullWidth
            onClick={() => navigate(`${base}/upload`, { replace: true })}
          >
            ＋ 사진 추가
          </Button>
          {/* 공개 동선은 비즈니스 모임만(CHMO-612) — 일반 모임엔 검수·공개 단계가 없어
              14 공개 요약도, 그 게이트를 미리 알리는 힌트도 가리킬 대상이 없다 */}
          {business && (
            <div className="relative">
              <Button fullWidth onClick={() => navigate(`${base}/publish`)}>
                공개 전 요약보기
              </Button>
              {/* 공개 게이트 힌트(CHMO-578) — "모든 앨범 검토 완료 = 공개 조건"(CHMO-488)은 화면
                  어디에도 미리 나오지 않아 14에 가서야 잠긴 버튼으로 알게 된다. 게이트가 실행되는
                  문(공개 요약 진입 버튼) 곁에서 계정당 1회 미리 말한다. 공개된 이벤트에선 지난
                  단계 안내라 안 띄우고, 앨범 0개면 검토할 대상이 없어 안 띄운다 */}
              {gateHintTurn && event.status !== 'published' && mainAlbums.length > 0 && (
                <CoachHint
                  id="publish-gate"
                  arrow="down"
                  className="bottom-full left-0 mb-1.5 w-max"
                >
                  모든 앨범을 검토 완료하면
                  <br />
                  멤버에게 공개할 수 있어요
                </CoachHint>
              )}
            </div>
          )}
        </div>
      </main>

      <EventSettings
        event={event}
        groupId={groupId}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEventUpdated={onEventUpdated}
      />

      {/* 빈 앨범 만들기(CHMO-471) — 이름만 받아 POST /events/:id/albums(사진 0장, CHMO-456).
          만든 뒤 09로 보내지 않는다: 빈 상세엔 할 게 없고, 사진은 사진 있는 앨범의 [옮기기]로 모은다 */}
      {createOpen && (
        <RenameModal
          open
          onClose={() => setCreateOpen(false)}
          title="앨범 만들기"
          label="인물 이름"
          placeholder="예: 김치즈"
          prefill={false}
          initialName=""
          maxLength={20}
          submitLabel="만들기"
          submittingLabel="만드는 중…"
          submit={(name) => createPersonAlbum(event.id, { name })}
          successMessage="🧀 앨범을 만들었어요"
          onRenamed={albumsApi.refetch}
          note="사진 없이 먼저 만들어 둬요. 다른 앨범에서 사진을 골라 [옮기기]로 이 앨범에 모을 수 있어요."
        />
      )}

      {/* 앨범 설정(이름 수정 + 멤버 연결) — 09 헤더 [✎ 앨범 설정]과 같은 시트·같은 API.
          이 화면은 앨범 목록만 refetch — 다른 이벤트의 같은 인물 앨범은 다음 진입 시 갱신된 이름으로
          조회된다(이름·연결 모두 모임 단위 personId라 전 이벤트에 걸쳐 적용).
          삭제는 주지 않는다 — 카드 이름 줄 탭에서 앨범이 사라지는 동작까지 열지 않는다(09에만) */}
      {albumTarget && (
        <AlbumSettingsSheet
          groupId={groupId}
          album={albumTarget}
          groupType={groupType}
          onClose={() => setAlbumTarget(null)}
          onUpdated={albumsApi.refetch}
        />
      )}
    </PhoneShell>
  )
}

/**
 * 08 그리드 맨 앞 "앨범 만들기" 타일(CHMO-471) — 앨범 카드와 같은 규격·점선 테두리 +
 * 플러스(09-1 이동 시트의 "새 앨범" 타일과 같은 문법). 보조 동작이라 커버 자리는
 * 사진 대신 muted 톤 플러스만 둬 실제 앨범 카드보다 시각적 우선순위를 낮춘다.
 */
function CreateAlbumTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border-2 border-dashed border-[#C9C2B4] bg-white p-2 text-left transition active:scale-[0.99]"
    >
      <span className="flex h-24 items-center justify-center rounded-[10px] bg-photo text-muted">
        <IconPlus size={26} />
      </span>
      <span className="mt-2 block text-sm font-bold text-text">앨범 만들기</span>
      <span className="mt-0.5 block text-[11px] text-muted">인물 추가</span>
    </button>
  )
}

/** 헤더 우측 ⚙ — 이벤트 설정 진입점(06-E·분석중·08 공통, 모임 상세 ⚙와 동일 꼴) */
function EventSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="이벤트 설정" onClick={onClick} className="text-lg text-muted">
      ⚙
    </button>
  )
}

interface EventSettingsProps {
  event: EventItem
  groupId: string
  /** 이름 수정 모달 열림 — 트리거(⚙)는 호출부 헤더가 소유 */
  open: boolean
  onClose: () => void
  /** 이름 수정 성공 후 이벤트 상세 갱신(refetch) */
  onEventUpdated: () => void
}

/**
 * ⚙ 이벤트 설정 = 이름 수정(RenameModal) + 이벤트 삭제(CHMO-278 — DELETE /events/:id).
 * 삭제는 위험 동작이라 설정 모달 하단 진입 + ConfirmDialog 확인을 거친다(모임 삭제와 동일 패턴).
 * 성공 시 05 모임 상세로 복귀(뒤로가기로 죽은 상세에 돌아오지 않게 replace).
 */
function EventSettings({ event, groupId, open, onClose, onEventUpdated }: EventSettingsProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    await mutate(() => deleteEvent(event.id), {
      onSuccess: () => {
        toast.show('🧀 이벤트를 삭제했어요')
        navigate(`/groups/${groupId}`, { replace: true })
      },
      onError: (msg) => {
        toast.show(msg)
        setDeleting(false)
        setDeleteOpen(false)
      },
    })
  }

  return (
    <>
      <RenameModal
        open={open}
        onClose={onClose}
        title="이벤트 설정"
        label="이벤트 이름"
        placeholder="예) 6.15 운동회 오전"
        initialName={event.name}
        submit={(name) => renameEvent(event.id, name)}
        successMessage="🧀 이벤트 이름을 바꿨어요"
        onRenamed={onEventUpdated}
        dangerLabel="이벤트 삭제"
        onDangerRequest={() => {
          onClose()
          setDeleteOpen(true)
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="이벤트를 삭제할까요?"
        description={
          event.status === 'published'
            ? '공개 중인 이벤트예요. 이벤트의 모든 앨범·사진이 삭제되고, 학부모 공유 화면에서도 사라져요. 되돌릴 수 없어요.'
            : '이벤트의 모든 앨범·사진이 삭제돼요. 되돌릴 수 없어요.'
        }
        confirmLabel="삭제"
        danger
        busy={deleting}
        busyLabel="삭제 중…"
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  )
}
