import { useLocation } from 'react-router-dom'
import { PhoneShell } from '../../components/PhoneShell'
import { BrandHero } from '../../components/BrandHero'
import { PinLoginForm } from '../../components/PinLoginForm'

/** 로그인에 가로막힌 화면(초대 링크 JoinPage 등)이 넘기는 복귀 목적지 */
interface AuthLocationState {
  returnTo?: string
}

/**
 * DEV 전용 닉네임+PIN 로그인 — 소셜 단일화(CHMO-557)로 01-1·01-2를 내리며 남긴 개발 입구.
 * 실 BE 확인은 test/1111, 목 시드는 이현정/1234가 유일한 진입로라 프로덕션 번들 밖에만 산다
 * (/dev/components와 같은 조건부 라우트, 진입은 01 랜딩의 DEV 링크). 가입 폼은 두지 않았다 —
 * 계정은 목 시드·소셜 로그인으로 만든다. BE /auth/login 엔드포인트가 제거되면 함께 걷는다.
 * 폼·제출 흐름은 심사용 숨김 폼(CHMO-572)과 공용(PinLoginForm).
 */
export function DevLoginPage() {
  const location = useLocation()
  const returnTo = (location.state as AuthLocationState | null)?.returnTo

  return (
    <PhoneShell>
      <BrandHero />
      <section className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-5">
        <h2 className="text-[15px] font-bold text-text">닉네임+PIN 로그인 (DEV 전용)</h2>
        <div className="mt-3">
          <PinLoginForm returnTo={returnTo} />
        </div>
      </section>
    </PhoneShell>
  )
}
