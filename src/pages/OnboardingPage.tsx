import { useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, IconCheck } from '../components/ui'
import { markOnboardingSeen } from '../lib/onboarding'
import { cx } from '../lib/cx'

/**
 * 00. 첫 사용 온보딩 (CHMO-481) · 와이어프레임 348:4 · 349:4 · 349:19.
 *
 * 로그인 직후 계정당 1회 노출(판정은 lib/onboarding.ts) — 서버를 부르지 않는 정적 화면이다.
 * 역할(선생님/학부모)로 나누지 않는다: role은 계정이 아니라 멤버십(모임별) 속성이라 로그인
 * 시점엔 어느 쪽인지 알 수 없고, 같은 사람이 모임마다 다른 역할일 수 있다(CHMO-480 확정).
 * 마지막 장이 진입점 둘로 갈라주는 역할만 한다.
 *
 * 슬라이드 전환은 CSS 스크롤 스냅 — 터치 관성·접근성을 브라우저에 맡기고, 현재 위치는
 * scrollLeft로 역산해 도트·CTA에만 반영한다(제스처를 직접 구현하지 않는다).
 */

interface Slide {
  key: string
  title: string
  desc: string
  Art: ComponentType
}

/** 사진 더미 → 아이별 앨범 */
function ClassifyArt() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <div className="flex gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] w-[72px] rounded-xl bg-photo" />
        ))}
      </div>
      <span aria-hidden className="text-xl leading-none text-muted">
        ↓
      </span>
      <div className="flex gap-2.5">
        <div className="h-12 w-12 rounded-full bg-primary" />
        <div className="h-12 w-12 rounded-full bg-surface" />
        <div className="h-12 w-12 rounded-full bg-surface" />
      </div>
    </div>
  )
}

/** 앨범 + 검토 완료 배지 */
function ReviewArt() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="relative">
        <div className="h-[130px] w-[130px] rounded-2xl bg-photo" />
        <span className="absolute -bottom-3 -right-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-text">
          <IconCheck size={24} />
        </span>
      </div>
      <div className="mt-7 h-2.5 w-24 rounded-full bg-surface" />
    </div>
  )
}

/** 초대 링크(처음 한 번) → 모임에 합류한 학부모 */
function InviteArt() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="rounded-full bg-surface px-5 py-3 text-[13px] text-muted">
        초대 링크 · 처음 한 번만
      </div>
      <span aria-hidden className="text-xl leading-none text-muted">
        ↓
      </span>
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-5 py-4">
        <div className="h-10 w-10 rounded-full bg-white" />
        <div className="h-10 w-10 rounded-full bg-primary" />
        <div className="h-10 w-10 rounded-full bg-white" />
      </div>
    </div>
  )
}

// 문구는 CHMO-480에서 확정(screen-spec 00) — 워딩 규칙상 'AI 분석'이 아니라 '분류'.
// 3장이 "링크 하나로 전달"이 아닌 이유: 참여 링크는 합류 초대용(처음 한 번)이고, 그 뒤로는
// 공개만 하면 학부모 화면에 뜬다. 전달 문구는 매번 링크를 보내야 하는 것처럼 읽힌다.
const SLIDES: Slide[] = [
  {
    key: 'classify',
    title: '사진만 올리면\n아이별로 자동 분류돼요',
    desc: '선생님이 일일이 고르지 않아도 돼요',
    Art: ClassifyArt,
  },
  {
    key: 'review',
    title: '공개 전에\n선생님이 확인해요',
    desc: '잘못 담긴 사진은 옮기거나 지울 수 있어요',
    Art: ReviewArt,
  },
  {
    key: 'invite',
    title: '한 번 초대하면\n공개할 때마다 바로 봐요',
    desc: '학부모는 연결된 자기 아이 사진만 봐요',
    Art: InviteArt,
  },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  // 설정 → '사용 방법 다시 보기'로 들어온 경우: 끝내면 설정으로 돌아간다
  const replay = params.get('replay') === '1'
  const exitTo = replay ? '/settings' : '/home'
  const isLast = index === SLIDES.length - 1

  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    setIndex(Math.min(Math.max(next, 0), SLIDES.length - 1))
  }

  const goTo = (i: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  /** 온보딩을 끝내며 목적지로 — 건너뛰기든 완주든 '봤다'로 기록한다 */
  const finish = (to: string) => {
    markOnboardingSeen()
    navigate(to, { replace: true })
  }

  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center justify-end px-5">
          {!isLast && (
            <button type="button" onClick={() => finish(exitTo)} className="text-sm text-muted">
              건너뛰기
            </button>
          )}
        </div>

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SLIDES.map((slide, i) => (
            <section
              key={slide.key}
              aria-label={`${i + 1}/${SLIDES.length}`}
              aria-hidden={i !== index}
              className="flex w-full shrink-0 snap-center flex-col px-5"
            >
              <div className="flex min-h-[180px] max-h-[300px] flex-1 items-center justify-center rounded-[20px] bg-white">
                <slide.Art />
              </div>
              <h2 className="mt-8 whitespace-pre-line text-center text-[24px] font-bold leading-snug text-text">
                {slide.title}
              </h2>
              <p className="mt-4 text-center text-sm text-muted">{slide.desc}</p>
            </section>
          ))}
        </div>

        <div className="flex shrink-0 justify-center gap-2 py-6">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`${i + 1}번째 안내 보기`}
              aria-current={i === index || undefined}
              onClick={() => goTo(i)}
              className={cx('h-2 w-2 rounded-full transition', i === index ? 'bg-primary' : 'bg-border')}
            />
          ))}
        </div>

        <div className="shrink-0 px-5 pb-safe-7">
          {isLast ? (
            <>
              <Button fullWidth onClick={() => finish('/groups/new')}>
                모임 만들기
              </Button>
              {/* 초대 코드는 홈의 02-1 모달에서 받는다 — 모달만 여는 전용 라우트를 새로 파지 않는다 */}
              <button
                type="button"
                onClick={() => {
                  markOnboardingSeen()
                  navigate('/home', { replace: true, state: { openJoin: true } })
                }}
                className="mt-4 w-full text-center text-[15px] font-bold text-accent"
              >
                초대 코드로 참여하기
              </button>
            </>
          ) : (
            <Button fullWidth onClick={() => goTo(index + 1)}>
              다음
            </Button>
          )}
        </div>
      </div>
    </PhoneShell>
  )
}
