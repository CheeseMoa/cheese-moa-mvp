import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlbumCard, Button, Cheddar, EventCard, GroupCard, IconClose, PhotoGrid } from './ui'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { cx } from '../lib/cx'

/**
 * 치즈모아 둘러보기 (CHMO-504) — 첫 로그인 직후 1회 + 설정에서 다시 보기.
 *
 * `모임 > 이벤트 > 앨범` 3단 정보구조를 **눌러서** 체감시킨다. 실제 화면 위 코치마크가 아니라
 * 축소된 앱 화면을 직접 그리므로 **모임이 하나도 없는 신규 가입자에게도 그대로 돌아간다**
 * (코치마크는 가리킬 대상 자체가 없다). 서버 호출 없음 · 라우팅 이동 없음.
 *
 * **전체 화면 오버레이다(모달 아님)** — 초안은 310px `Modal` 안에 가짜 상단 바까지 그린
 * 미니 화면이었는데 "촌스럽다"는 피드백을 받았다(2026-07-28). 낡아 보인 원인 셋을 걷어냈다:
 * ① 액자(가짜 `‹ 홈` 바) — 없앴다. 실물 카드만 여백 위에 띄운다. ② 카드 전체를 감싼 점멸 링
 * (핫스팟) — 작은 탭 물결 하나로 줄였다. ③ 한 화면에 일곱 겹(제목·설명·카운터·링크·버튼 2개…)
 * — 무대 / 문구 / 액션 1개, 세 겹으로 줄이고 진행은 상단 세그먼트 바가 맡는다.
 *
 * **역할로 갈라 보여준다**: 계정에는 role이 없고 role은 멤버십(모임별) 속성이지만(CHMO-480)
 * **구조는 역할마다 실제로 다르다** — 선생님은 모임→이벤트→앨범 3단이고 학부모는 앨범 단계가
 * 없다(18·19: 아이 사진이 한 화면에 펼쳐진다). 선생님 흐름만 보여주면 학부모로 합류한 사람은
 * 자기 화면을 영영 못 본다. 첫 장에서 갈래를 고르고 마지막 장에서 반대편으로 건너뛴다.
 *
 * 무대는 실물 카드 컴포넌트(GroupCard·EventCard·AlbumCard·PhotoGrid)로 조립한다 — 화면
 * 디자인이 바뀌면 투어도 따라 바뀐다(목업을 따로 그리면 둘이 갈라진다).
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
 * 탭 지점 인디케이터 — 카드 오른쪽 아래 모서리에 걸친 작은 물결.
 * 카드 전체를 링으로 감싸면(초안) 튜토리얼 티가 나고 카드 자체가 안 읽힌다.
 */
function TapPulse() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center"
    >
      <span className="absolute h-6 w-6 animate-tap-ripple rounded-full bg-primary" />
      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
    </span>
  )
}

/** 탭 대상 — 실물 카드를 그대로 감싸고 인디케이터만 얹는다 */
function TapTarget({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <TapPulse />
    </div>
  )
}

/** 갈래 선택 카드 — 신규 일러스트 없이 기존 토큰·형태 재사용(CHMO-480 비주얼 규칙) */
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
      className="flex w-full items-center gap-3.5 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <span className="shrink-0">{symbol}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-text">{label}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{desc}</span>
      </span>
      <span aria-hidden className="text-lg text-[#C9C2B4]">
        ›
      </span>
    </button>
  )
}

interface StepView {
  /** 무대 위 화면 제목 — 실제 화면의 h2와 같은 문구를 써서 어느 화면인지 알려준다 */
  screenTitle: string
  screenSub?: string
  stage: ReactNode
  title: string
  desc: string
}

interface AppTourProps {
  open: boolean
  onClose: () => void
}

export function AppTour({ open, onClose }: AppTourProps) {
  const [track, setTrack] = useState<Track | null>(null)
  const [step, setStep] = useState(0)
  // 어느 이벤트를 눌렀는지 기억해 다음 장 화면 제목에 그대로 쓴다 — 목록의 두 카드가 모두
  // 살아 있어야 "모임 안에 행사가 여러 개"가 보이고, 죽은 카드(탭해도 무반응)도 안 생긴다
  const [picked, setPicked] = useState(TOUR_EVENTS[0])

  useEscapeKey(open, onClose)

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
      screenTitle: '내 모임',
      screenSub: '참여 중인 모임을 확인하세요',
      stage: (
        <TapTarget>
          <GroupCard {...TOUR_GROUP} onClick={() => setStep(1)} />
        </TapTarget>
      ),
      title: '모임은 우리 반이에요',
      desc: '선생님과 학부모가 함께 있는 공간이에요',
    },
    {
      screenTitle: TOUR_GROUP.name,
      screenSub: TOUR_GROUP_META,
      stage: (
        <div className="flex flex-col gap-3">
          {TOUR_EVENTS.map((event, i) => {
            const card = <EventCard {...event} onClick={() => enterEvent(event)} />
            return i === 0 ? (
              <TapTarget key={event.name}>{card}</TapTarget>
            ) : (
              <div key={event.name}>{card}</div>
            )
          })}
        </div>
      ),
      title: '이벤트는 하루의 행사예요',
      desc: '물놀이·소풍처럼 행사마다 하나씩 만들어요',
    },
    {
      screenTitle: picked.name,
      screenSub: picked.meta,
      stage: (
        <div className="grid grid-cols-2 gap-3">
          {TOUR_ALBUMS.map((album) => (
            <AlbumCard key={album.name} album={album} />
          ))}
        </div>
      ),
      title: '사진은 아이별 앨범으로 나뉘어요',
      desc: '올리기만 하면 자동으로 분류돼요',
    },
  ]

  const parentSteps: StepView[] = [
    {
      screenTitle: '내 모임',
      screenSub: '참여 중인 모임을 확인하세요',
      stage: (
        <TapTarget>
          <GroupCard
            name={TOUR_GROUP.name}
            subtitle="학부모 · 참여 중"
            onClick={() => setStep(1)}
          />
        </TapTarget>
      ),
      title: '모임은 아이 반이에요',
      desc: '선생님이 승인하면 참여 중으로 바뀌어요',
    },
    {
      screenTitle: TOUR_GROUP.name,
      screenSub: '학부모 · 김민준',
      // 18은 커버·상태 배지 없는 텍스트 카드 — 전부 공개된 이벤트라 배지가 무의미하다
      stage: (
        <div className="flex flex-col gap-3">
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
      ),
      title: '공개된 행사만 보여요',
      desc: '선생님이 공개하면 여기에 바로 떠요',
    },
    {
      screenTitle: picked.name,
      screenSub: '김민준 · 공통 포함 14장',
      // 학부모에겐 앨범 단계가 없다 — 고를 것 없이 사진이 바로 펼쳐진다(19)
      stage: (
        <div aria-hidden>
          <PhotoGrid>
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="cheese-dots aspect-square w-full rounded-xl bg-photo" />
            ))}
          </PhotoGrid>
        </div>
      ),
      title: '우리 아이 사진만 모여 있어요',
      desc: '아이가 나온 사진과 다 함께 찍은 사진이 한 화면에 담겨요',
    },
  ]

  if (!open) return null

  const steps = track === 'parent' ? parentSteps : teacherSteps
  const current = track ? steps[step] : null
  const isLast = step === STEP_COUNT - 1

  const goBack = () => {
    if (step > 0) setStep(step - 1)
    else setTrack(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="치즈모아 둘러보기"
      className="absolute inset-0 z-50 flex flex-col bg-cream"
    >
      {/* 상단 — 뒤로 · 세그먼트 진행바 · 나가기. '1 / 3' 텍스트 카운터를 대신한다 */}
      <div className="flex h-12 shrink-0 items-center gap-3 px-5">
        {current ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="이전 단계"
            className="-ml-1 w-6 text-lg leading-none text-muted"
          >
            ‹
          </button>
        ) : (
          <span className="-ml-1 w-6" />
        )}
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span
              key={i}
              className={cx(
                'h-[3px] flex-1 rounded-full transition-colors duration-300',
                current && i <= step ? 'bg-primary' : 'bg-border',
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="둘러보기 닫기"
          className="-mr-1 text-muted"
        >
          <IconClose size={20} />
        </button>
      </div>

      {!current ? (
        <div className="flex min-h-0 flex-1 animate-step-in flex-col overflow-y-auto px-5 pb-safe-7">
          <div className="my-auto w-full">
            <Cheddar size={64} />
            <h2 className="mt-6 text-[24px] font-bold leading-snug text-text">
              치즈모아가 어떻게 생겼는지
              <br />
              먼저 둘러볼까요?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              보는 화면이 역할마다 달라요.
              <br />
              어느 쪽으로 오셨나요?
            </p>
            <div className="mt-7 flex flex-col gap-3">
              <TrackChoice
                symbol={
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-emblem">
                    <Cheddar size={30} />
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
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
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
            <p className="mt-4 text-center text-xs text-muted">
              둘 다 볼 수 있어요 · 고른 쪽은 저장되지 않아요
            </p>
          </div>
        </div>
      ) : (
        // key로 단계마다 새로 마운트 → 전환 애니메이션이 매번 다시 재생된다
        <div
          key={`${track}-${step}`}
          className="flex min-h-0 flex-1 animate-step-in flex-col px-5 pb-safe-7"
        >
          {/* 무대 — 액자 없이 실제 화면의 제목 + 실물 카드만 여백 위에 띄운다 */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
            <div className="my-auto w-full">
              <p className="truncate text-xl font-bold text-text">{current.screenTitle}</p>
              {current.screenSub && (
                <p className="mt-1 truncate text-[13px] text-muted">{current.screenSub}</p>
              )}
              <div className="mt-4">{current.stage}</div>
            </div>
          </div>

          {/* 문구 */}
          <div className="shrink-0 pt-7">
            <h2 className="text-[22px] font-bold leading-snug text-text">{current.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{current.desc}</p>
          </div>

          {/* 액션 — 진행은 카드 탭이 맡으므로 [다음] 버튼을 두지 않는다(한 화면 한 가지) */}
          <div className="mt-6 shrink-0">
            {isLast ? (
              <>
                <Button fullWidth onClick={onClose}>
                  다 봤어요
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setTrack(track === 'teacher' ? 'parent' : 'teacher')
                    setStep(0)
                  }}
                  className="mt-4 w-full text-center text-[15px] font-bold text-accent"
                >
                  {track === 'teacher' ? '학부모 화면도 보기' : '선생님 화면도 보기'}
                </button>
              </>
            ) : (
              <p className="text-center text-[13px] text-muted">카드를 눌러 보세요</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
