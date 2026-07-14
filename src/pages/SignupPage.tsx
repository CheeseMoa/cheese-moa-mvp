import { PhoneShell } from '../components/PhoneShell'
import { BrandHero } from '../components/BrandHero'
import { AuthCredentialsForm } from '../components/AuthCredentialsForm'

/** 01-2. 계정 생성 · node 243:2 · POST /auth/signup — 토큰 보유 시 GuestGuard가 홈으로 */
export function SignupPage() {
  return (
    <PhoneShell>
      <BrandHero />
      <AuthCredentialsForm mode="signup" />
    </PhoneShell>
  )
}
