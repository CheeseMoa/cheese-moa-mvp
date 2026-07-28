import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlbumCard, Button, Cheddar, EventCard, GroupCard, Modal, PhotoGrid } from './ui'

/**
 * 앱 구조 둘러보기 (CHMO-504) — 모달 안 미니 앱 투어.
 *
 * 온보딩 3장(CHMO-480·481)이 "무엇을 해주는 서비스인가"를 말한다면, 이 투어는
 * `모임 > 이벤트 > 앨범` **3단 정보구조**를 눌러서 체감시킨다(슬라이드=가치, 투어=구조).
 *
 * 실제 화면 위 코치마크가 아니라 모달 안에 축소된 가짜 화면을 그린다 — 실제 데이터·라우팅과
 * 무관해 **모임이 하나도 없는 신규 가입자에게도 보여줄 수 있다**(코치마크는 가리킬 대상이 없다).
 * 서버 호출 없음 · 라우팅 이동 없음(모달 안에서만 상태 전환).
 *
 * **역할로 갈라 보여준다**: 계정에는 role이 없고 role은 멤버십(모임별) 속성이라(CHMO-480)
 * 온보딩 슬라이드는 역할 무관 공통이지만, **구조는 역할마다 실제로 다르다** — 선생님은
 * 모임→이벤트→앨범 3단이고 학부모는 앨범 단계가 없다(18·19: 모임→이벤트→아이 사진 한 화면).
 * 선생님 흐름만 보여주면 학부모로 합류한 사람은 자기 화면을 영영 못 본다. 그래서 첫 장에서
 * 갈래를 고르게 하고, 마지막 장에서 반대편으로 건너갈 수 있게 둔다.
 *
 * 미니 화면은 실물 카드 컴포넌트(GroupCard·EventCard·AlbumCard·PhotoGrid)로 조립한다 —
 * 화면 디자인이 바뀌면 투어도 따라 바뀐다(목업을 따로 그리면 둘이 갈라진다).
 */

type Track = 'teacher' | 'parent'

const STEP_COUNT = 3

/** 투어용 가짜 데이터 — 어떤 API도 부르지 않는다 */
const TOUR_GROUP = { name: '별님반', memberCount: 6, eventCount: 2 }
/** 05 헤더의 카운트 분리 표기(§7-3)와 같은 꼴 — 멤버 6 = 선생님 2 + 학부모 4 */
const TOUR_GROUP_META = '선생님 2 · 학부모 4 · 이벤트 2개'

const TOUR_EVENTS = [
  { name: '여름 물놀이', meta: '7월 22일 · 사진 120장', status: 'ready' as const },
  { name: '봄 소풍', meta: '5월 9일 · 사진 86장', status: 'published' as const },
]

// 특수 앨범 표시명은 lib/albumLabels.ts와 같은 문구를 쓴다(공통 · 분류가 어려워요)
const TOUR_ALBUMS = [
  { type: 'person' as const, name: '김민준', photoCount: 12, unreviewedPhotoCount: 0 },
  { type: 'person' as const, name: '이서연', photoCount: 9, unreviewedPhotoCount: 3 },
  { type: 'common' as const, name: '공통', photoCount: 6, unreviewedPhotoCount: 0 },
  { type: 'uncertain' as const, name: '분류가 어려워요', photoCount: 2 },
]

/**
 * 미니 화면 프레임 — 가짜 상단 바 + 높이 고정 본문.
 *
 * 높이를 고정하는 이유 둘: ① 단계를 넘길 때 모달 크기가 튀지 않는다 ② Modal은 내부 스크롤이
 * 없어 내용이 뷰포트보다 길면 잘린다 — 앨범 그리드(2×2)가 가장 길어 여기서 막아 둔다.
 * 프레임보다 내용이 길면 미니 화면 안에서 스크롤되는데, 실제 화면도 그렇게 스크롤되므로
 * 목업의 사실성을 해치지 않는다. 뺄셈 값은 모달의 나머지 요소(제목·설명·버튼) 높이 합.
 */
function MiniScreen({
  back,
  heading,
  sub,
  children,
}: {
  /** 가짜 상단 바의 '‹ 뒤로' 라벨 — 지금 어느 화면 아래인지 알려준다 */
  back: string
  heading: string
  sub?: string
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-cream shadow-card">
      <div
        aria-hidden
        className="flex h-8 items-center border-b border-border bg-surface px-3 text-[11px] text-muted"
      >
        ‹ {back}
      </div>
      <div className="h-[clamp(200px,calc(100dvh-380px),380px)] overflow-y-auto p-3">
        <p className="truncate text-[15px] font-bold text-text">{heading}</p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
        <div className="mt-2.5">{children}</div>
      </div>
    </div>
  )
}

/** 탭 대상 강조 — 카드 바깥에 링만 깜빡인다(카드 자체를 흐리게 하지 않게 오버레이로 분리) */
function TapTarget({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-[5px] animate-pulse rounded-[20px] ring-2 ring-primary"
      />
      {children}
    </div>
  )
}

function TapHint() {
  return (
    <p className="mt-2.5 text-center">
      <span className="inline-flex rounded-full bg-primary/25 px-2.5 py-1 text-[11px] font-bold text-heading">
        탭해서 들어가 보세요
      </span>
    </p>
  )
}

/** 갈래 선택 카드 — 좌측 심볼은 신규 일러스트 없이 기존 형태 재사용(CHMO-480 비주얼 규칙) */
function TrackChoice({
  symbol,
  label,
  desc,
  onClick,
}: {
  symbol: ReactNode
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <span className="shrink-0">{symbol}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-text">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{desc}</span>
      </span>
      <span aria-hidden className="text-lg text-[#C9C2B4]">
        ›
      </span>
    </button>
  )
}

interface StepView {
  title: string
  desc: string
  screen: ReactNode
}

interface AppTourModalProps {
  open: boolean
  onClose: () => void
}

export function AppTourModal({ open, onClose }: AppTourModalProps) {
  const [track, setTrack] = useState<Track | null>(null)
  const [step, setStep] = useState(0)
  // 어느 이벤트를 눌렀는지 기억해 다음 장 화면 제목에 그대로 쓴다 — 목록의 두 카드가 모두
  // 살아 있어야 "모임 안에 행사가 여러 개"가 보이고, 죽은 카드(탭해도 무반응)도 안 생긴다
  const [picked, setPicked] = useState(TOUR_EVENTS[0])

  // 다시 열면 처음부터 — 닫은 지점이 남아 있으면 '둘러보기'가 중간부터 시작한다
  useEffect(() => {
    if (open) {
      setTrack(null)
      setStep(0)
      setPicked(TOUR_EVENTS[0])
    }
  }, [open])

  const enterEvent = (event: (typeof TOUR_EVENTS)[number]) => {
    setPicked(event)
    setStep(2)
  }

  const teacherSteps: StepView[] = [
    {
      title: '모임은 우리 반이에요',
      desc: '선생님과 학부모가 함께 있는 공간이에요',
      screen: (
        <MiniScreen back="홈" heading="내 모임" sub="참여 중인 모임을 확인하세요">
          <TapTarget>
            <GroupCard {...TOUR_GROUP} onClick={() => setStep(1)} />
          </TapTarget>
          <TapHint />
        </MiniScreen>
      ),
    },
    {
      title: '이벤트는 하루의 행사예요',
      desc: '물놀이·소풍처럼 행사마다 하나씩 만들어요',
      screen: (
        <MiniScreen back="홈" heading={TOUR_GROUP.name} sub={TOUR_GROUP_META}>
          <div className="flex flex-col gap-2.5">
            {TOUR_EVENTS.map((event, i) => {
              const card = <EventCard {...event} onClick={() => enterEvent(event)} />
              return i === 0 ? (
                <TapTarget key={event.name}>{card}</TapTarget>
              ) : (
                <div key={event.name}>{card}</div>
              )
            })}
          </div>
          <TapHint />
        </MiniScreen>
      ),
    },
    {
      title: '사진은 아이별 앨범으로 나뉘어요',
      desc: '올리기만 하면 자동으로 분류돼요',
      screen: (
        <MiniScreen back={TOUR_GROUP.name} heading={picked.name} sub={picked.meta}>
          <div className="grid grid-cols-2 gap-2.5">
            {TOUR_ALBUMS.map((album) => (
              <AlbumCard key={album.name} album={album} />
            ))}
          </div>
        </MiniScreen>
      ),
    },
  ]

  const parentSteps: StepView[] = [
    {
      title: '모임은 아이 반이에요',
      desc: '선생님이 승인하면 참여 중으로 바뀌어요',
      screen: (
        <MiniScreen back="홈" heading="내 모임" sub="참여 중인 모임을 확인하세요">
          <TapTarget>
            <GroupCard
              name={TOUR_GROUP.name}
              subtitle="학부모 · 참여 중"
              onClick={() => setStep(1)}
            />
          </TapTarget>
          <TapHint />
        </MiniScreen>
      ),
    },
    {
      title: '공개된 행사만 보여요',
      desc: '선생님이 공개하면 여기에 바로 떠요',
      screen: (
        <MiniScreen back="홈" heading={TOUR_GROUP.name} sub="학부모 · 김민준">
          {/* 18은 커버·상태 배지 없는 텍스트 카드 — 전부 공개된 이벤트라 배지가 무의미하다 */}
          <div className="flex flex-col gap-2.5">
            {TOUR_EVENTS.map((event, i) => {
              const card = (
                <button
                  type="button"
                  onClick={() => enterEvent(event)}
                  className="w-full rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
                >
                  <span className="block truncate text-base font-bold text-text">{event.name}</span>
                  <span className="mt-1 block text-xs text-muted">{event.meta}</span>
                </button>
              )
              return i === 0 ? (
                <TapTarget key={event.name}>{card}</TapTarget>
              ) : (
                <div key={event.name}>{card}</div>
              )
            })}
          </div>
          <TapHint />
        </MiniScreen>
      ),
    },
    {
      title: '우리 아이 사진만 모여 있어요',
      desc: '아이가 나온 사진과 다 함께 찍은 사진이 한 화면에 담겨요',
      screen: (
        <MiniScreen back={TOUR_GROUP.name} heading={picked.name} sub="김민준 · 공통 포함 14장">
          {/* 학부모에겐 앨범 단계가 없다 — 고를 것 없이 사진이 바로 펼쳐진다(19) */}
          <div aria-hidden>
            <PhotoGrid>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="cheese-dots aspect-square w-full rounded-xl bg-photo" />
              ))}
            </PhotoGrid>
          </div>
        </MiniScreen>
      ),
    },
  ]

  const steps = track === 'parent' ? parentSteps : teacherSteps
  const current = track ? steps[step] : null
  const isLast = step === STEP_COUNT - 1

  const goBack = () => {
    if (step > 0) setStep(step - 1)
    else setTrack(null)
  }

  return (
    <Modal open={open} onClose={onClose} title="앱 구조 둘러보기">
      {!current ? (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            보는 화면이 서로 달라요.
            <br />
            어떤 쓰임으로 오셨나요?
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            <TrackChoice
              symbol={
                <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-emblem">
                  <Cheddar size={28} />
                </span>
              }
              label="사진을 올려요"
              desc="선생님 · 행사를 여는 쪽"
              onClick={() => {
                setTrack('teacher')
                setStep(0)
              }}
            />
            <TrackChoice
              symbol={
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary">
                  <span className="h-5 w-5 rounded-full bg-white/70" />
                </span>
              }
              label="아이 사진을 받아요"
              desc="학부모 · 초대받아 참여한 쪽"
              onClick={() => {
                setTrack('parent')
                setStep(0)
              }}
            />
          </div>
          {/* 한 계정이 모임마다 다른 역할일 수 있다 — 고른 쪽이 계정에 남지 않는다는 걸 밝힌다 */}
          <p className="mt-3 text-center text-[11px] text-muted">
            모임마다 역할이 다를 수 있어요. 둘 다 볼 수 있어요.
          </p>
          <Button variant="secondary" fullWidth className="mt-4" onClick={onClose}>
            닫기
          </Button>
        </>
      ) : (
        <>
          <div className="mt-3.5">{current.screen}</div>
          <h3 className="mt-4 text-center text-[17px] font-bold text-text">{current.title}</h3>
          <p className="mt-1.5 text-center text-[13px] leading-relaxed text-muted">
            {current.desc}
          </p>
          <p aria-live="polite" className="mt-3 text-center text-[11px] text-muted">
            {step + 1} / {STEP_COUNT}
          </p>
          {isLast && (
            <button
              type="button"
              onClick={() => {
                setTrack(track === 'teacher' ? 'parent' : 'teacher')
                setStep(0)
              }}
              className="mt-3 w-full text-center text-[13px] font-bold text-accent"
            >
              {track === 'teacher' ? '학부모 화면도 보기' : '선생님 화면도 보기'}
            </button>
          )}
          <div className="mt-4 flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={goBack}>
              이전
            </Button>
            {isLast ? (
              <Button className="flex-1" onClick={onClose}>
                다 봤어요
              </Button>
            ) : (
              <Button variant="secondary" className="flex-1" onClick={onClose}>
                닫기
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
