import { PhoneShell } from '../components/PhoneShell'
import { BrandHero } from '../components/BrandHero'
import { AuthCredentialsForm } from '../components/AuthCredentialsForm'

/** 01-1. 로그인 · node 243:33 · POST /auth/login — 토큰 보유 시 GuestGuard가 홈으로 */
export function LoginPage() {
  return (
    <PhoneShell>
      <BrandHero />
      <AuthCredentialsForm mode="login" />
    </PhoneShell>
  )
}
