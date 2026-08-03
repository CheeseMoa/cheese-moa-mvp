import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { BrandHero } from '../components/BrandHero'
import { SocialLoginButtons } from '../components/SocialLoginButtons'
import { PinLoginForm } from '../components/PinLoginForm'
import { EMPTY_TAP_STREAK, advanceTapStreak, reachesReviewLogin } from '../lib/reviewLogin'

/** 로그인에 가로막힌 화면(초대 링크 JoinPage 등)이 넘기는 복귀 목적지 */
interface AuthLocationState {
  returnTo?: string
}

/**
 * 01. 로그인 진입 · node 211:1343 — 소셜 로그인 단일(CHMO-557, 닉네임+PIN 화면 제거).
 * `/`와 `/login`이 같은 화면을 그린다 — /login은 앱 전역 401 복귀 목적지(가드·unauthorizedTo)라
 * 라우트를 남기고 화면만 합쳤다. returnTo 소비(초대 링크 복귀)도 종전 01-1 폼에서 이어받았다.
 * 토큰 보유 시 GuestGuard가 홈으로.
 *
 * 심사용 숨김 로그인(CHMO-572): 로고 5회 연속 탭이면 ID/PIN 폼을 화면 안에 노출한다 —
 * 스토어 심사관이 소셜 계정 없이 데모 계정으로 들어오는 상시 진입점(심사 노트에 절차 공개,
 * 애플 2.1 대응). 노출은 컴포넌트 상태뿐이라 새로고침·재방문이면 다시 숨는다(비영속 — 일반
 * 사용자 오발견 최소화). 판정 규칙은 lib/reviewLogin.ts 단일 원천.
 */
export function LandingPage() {
  const location = useLocation()
  const returnTo = (location.state as AuthLocationState | null)?.returnTo
  const [reviewLoginOpen, setReviewLoginOpen] = useState(false)
  const tapStreak = useRef(EMPTY_TAP_STREAK)
  const reviewFormRef = useRef<HTMLDivElement>(null)

  const handleSymbolTap = () => {
    tapStreak.current = advanceTapStreak(tapStreak.current, Date.now())
    if (reachesReviewLogin(tapStreak.current)) setReviewLoginOpen(true)
  }

  // 폼이 소셜 버튼 아래(첫 화면 밖)에 열리므로 열린 걸 심사관이 놓치지 않게 끌어내린다
  useEffect(() => {
    if (reviewLoginOpen) {
      reviewFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [reviewLoginOpen])

  return (
    <PhoneShell>
      {/* 셸이 고정 높이(h-dvh)라 넘치는 짧은 화면에선 이 래퍼가 스크롤을 소유한다(CHMO-396) */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex flex-1 flex-col justify-center">
          <BrandHero onSymbolTap={handleSymbolTap} />
        </div>
        <div className="flex flex-col gap-3 px-5 pb-safe-9">
          {returnTo?.startsWith('/join/') && (
            <p className="rounded-xl bg-primary/15 px-4 py-3 text-[13px] leading-relaxed text-text">
              🧀 초대받은 모임에 참여하려면 로그인이 필요해요. 완료하면 참여 화면으로 이어져요.
            </p>
          )}
          <SocialLoginButtons returnTo={returnTo} />
          {reviewLoginOpen ? (
            <div ref={reviewFormRef} className="mt-2">
              {/* 라벨은 'ID' — 심사 노트가 "sign in with ID test / PIN 1111"로 안내한다(CHMO-543) */}
              <h2 className="text-[15px] font-bold text-text">ID/PIN 로그인</h2>
              <div className="mt-3">
                <PinLoginForm returnTo={returnTo} idLabel="ID" idPlaceholder="ID 입력" />
              </div>
            </div>
          ) : null}
          {import.meta.env.DEV ? (
            <div className="mt-1 flex flex-col items-center gap-2">
              {/* 닉네임+PIN은 소셜 단일화(CHMO-557)로 화면에서 내렸다 — 실 BE test 계정·목 시드
                  (이현정/1234) 로그인이 유일한 확인 수단이라 DEV 빌드에만 입구를 남긴다 */}
              <Link
                to="/dev/login"
                state={location.state} // returnTo 유실 방지
                className="text-xs text-muted underline underline-offset-2"
              >
                닉네임+PIN 로그인 (DEV 전용)
              </Link>
              {/* 시연·수동 QA용 뷰어 플로우 진입점 — 학부모는 원래 공유 링크로 직접 들어온다 */}
              <Link
                to="/share/shr_grp1"
                className="text-xs text-muted underline underline-offset-2"
              >
                학부모 공유 시연 (DEV 전용 · 비밀번호 7421)
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </PhoneShell>
  )
}
