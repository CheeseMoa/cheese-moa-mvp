import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toErrorMessage } from '../../api/client'
import { PIN_RE } from '../../lib/pin'
import { Cheddar } from '../../components/ui/Cheddar'
import { adminLogin } from '../api/admin'

interface AdminLoginCardProps {
  /** 로그인 성공 — 호출부(AdminLayout)가 게이트(GET /admin/me)를 다시 판정한다. 라우팅 이동 없음 */
  onSuccess: () => void
  /** 세션 만료 등 폼 위 한 줄 안내(없으면 기본 안내) */
  notice?: string
}

/**
 * 어드민 진입 로그인 카드(CHMO-594) — 비로그인으로 /admin에 오면 모바일 랜딩으로 보내지 않고
 * 이 카드를 그 자리에 그린다. 같은 계정·같은 POST /auth/login이라 인증 체계 추가가 아니다
 * (CHMO-375 결정 유지). 소셜 계정 관리자는 아래 링크로 01 랜딩에 다녀온다(returnTo=/admin —
 * 소셜은 외부 왕복이 필수라 이 카드 안에서 끝낼 수 없다).
 */
export function AdminLoginCard({ onSuccess, notice }: AdminLoginCardProps) {
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = nickname.trim().length > 0 && PIN_RE.test(pin) && !busy

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await adminLogin({ nickname: nickname.trim(), pin })
      onSuccess()
    } catch (err) {
      // 401(자격 오류)도 이 폼이 로그인 표면이다 — 리다이렉트 없이 메시지로("닉네임 또는 PIN이…")
      setError(toErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="w-[360px] rounded-xl border border-admin-border bg-admin-surface px-7 py-8">
      <div className="flex flex-col items-center gap-2">
        <Cheddar size={40} />
        <p className="text-[17px] font-bold text-heading">치즈모아 관리자</p>
        <p className="text-xs text-admin-muted">{notice ?? '내부 운영자 전용 화면이에요.'}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-admin-muted">닉네임</span>
          <input
            type="text"
            autoComplete="username"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="h-10 rounded-lg border border-admin-border bg-admin-surface px-3 text-[14px] placeholder:text-admin-muted focus:border-primary focus:outline-none"
            placeholder="운영자 계정 닉네임"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-admin-muted">PIN 번호 (숫자 4자)</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="h-10 rounded-lg border border-admin-border bg-admin-surface px-3 text-[14px] tracking-widest placeholder:tracking-normal placeholder:text-admin-muted focus:border-primary focus:outline-none"
            placeholder="PIN 번호 입력"
          />
        </label>

        {error ? (
          <p role="alert" className="text-[13px] text-warn">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 h-10 rounded-lg bg-primary text-[14px] font-semibold text-admin-text disabled:opacity-50"
        >
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>

      <div className="mt-5 border-t border-admin-border pt-4 text-center">
        <Link
          to="/login"
          state={{ returnTo: '/admin' }}
          className="text-[13px] text-admin-muted hover:text-admin-text hover:underline"
        >
          소셜 계정으로 로그인 →
        </Link>
      </div>
    </div>
  )
}
