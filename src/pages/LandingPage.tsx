import { Link } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { BrandHero } from '../components/BrandHero'
import { SocialLoginButtons } from '../components/SocialLoginButtons'
import { ButtonLink } from '../components/ui'

/** 01. 로그인 진입 · node 211:1343 — 로그인/계정 생성 선택. 토큰 보유 시 GuestGuard가 홈으로. */
export function LandingPage() {
  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col justify-center">
        <BrandHero />
      </div>
      <div className="flex flex-col gap-3 px-5 pb-9">
        <SocialLoginButtons />
        {/* 닉네임+PIN은 소셜 완전 대체(CHMO-359) 전까지 병행 유지 */}
        <div className="my-1 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">또는</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ButtonLink to="/login" fullWidth>
          로그인
        </ButtonLink>
        <ButtonLink to="/signup" variant="secondary" fullWidth>
          계정 생성
        </ButtonLink>
        {/* 시연·수동 QA용 뷰어 플로우 진입점 — 학부모는 원래 공유 링크로 직접 들어온다 */}
        {import.meta.env.DEV ? (
          <Link
            to="/share/shr_grp1"
            className="mt-1 text-center text-xs text-muted underline underline-offset-2"
          >
            학부모 공유 시연 (DEV 전용 · 비밀번호 7421)
          </Link>
        ) : null}
      </div>
    </PhoneShell>
  )
}
