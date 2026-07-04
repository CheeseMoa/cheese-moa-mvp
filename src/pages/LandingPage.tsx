import { Link } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { BrandHero } from '../components/BrandHero'
import { ButtonLink } from '../components/ui'

/** 01. 로그인 진입 · node 211:1343 — 로그인/계정 생성 선택. 토큰 보유 시 GuestGuard가 홈으로. */
export function LandingPage() {
  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col justify-center">
        <BrandHero />
      </div>
      <div className="flex flex-col gap-3 px-5 pb-9">
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
