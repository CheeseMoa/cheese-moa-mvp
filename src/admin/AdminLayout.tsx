import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { clearAuthTokens, getAccessToken } from '../lib/auth'
import { useApi } from '../hooks/useApi'
import { getAdminProfile } from './api/admin'
import { AdminSidebar } from './components/AdminSidebar'
import { AdminLoginCard } from './components/AdminLoginCard'
import { AdminErrorMessage, AdminMessage } from './components/AdminMessage'

/**
 * 어드민 셸 + 진입 가드 (CHMO-379·594) — /admin/* 전체를 감싼다.
 *
 * 가드 판정은 GET /admin/me(CHMO-377 — BE가 명시한 FE 진입 게이트):
 * - 무토큰 → **그 자리에서 어드민 로그인 카드**(CHMO-594 — 모바일 랜딩으로 보내지 않는다.
 *   로그인 성공은 라우팅 이동 없이 게이트 재판정으로 잇는다)
 * - 401(토큰 무효 — apiFetch가 이미 토큰 폐기) → 같은 카드 + 세션 만료 안내
 * - 403(ADMIN403 = 관리자 아님) → 차단 화면. 기다려도 안 풀리는 권한 문제라 재시도가 없고,
 *   [다른 계정으로 로그인]이 토큰을 지우고 카드로 되돌린다
 * - 그 외(네트워크 등) → 재시도
 *
 * 데스크탑 레이아웃(1440 기준) — PhoneShell을 두르지 않고 사이드바 240 + 콘텐츠 칼럼.
 * 폭이 셸 없이도 성립하도록 min-w를 걸어 좁은 창에선 가로 스크롤로 둔다(내부 운영자 전용).
 */
export function AdminLayout() {
  // 로그인·계정 전환은 라우팅이 아니라 이 틱으로 게이트를 다시 돌린다(useApi 키에 섞인다)
  const [authTick, setAuthTick] = useState(0)
  const rerunGate = () => setAuthTick((t) => t + 1)

  const authed = Boolean(getAccessToken())
  const profile = useApi(authed ? `admin-me:${authTick}` : null, (signal) =>
    getAdminProfile(signal),
  )

  if (!authed) {
    return (
      <AdminGate>
        <AdminLoginCard onSuccess={rerunGate} />
      </AdminGate>
    )
  }

  if (profile.error) {
    if (profile.error.status === 401) {
      // apiFetch가 토큰을 지웠다 — 재로그인 표면도 여기(어드민)다
      return (
        <AdminGate>
          <AdminLoginCard onSuccess={rerunGate} notice="세션이 만료됐어요 · 다시 로그인해 주세요." />
        </AdminGate>
      )
    }
    if (profile.error.status === 403) {
      return (
        <AdminGate>
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-admin-border bg-admin-surface px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">관리자 권한이 필요해요</p>
            <p className="text-[13px] text-admin-muted">
              이 화면은 치즈모아 내부 운영자 전용이에요.
            </p>
            <button
              type="button"
              onClick={() => {
                clearAuthTokens()
                rerunGate()
              }}
              className="mt-1 h-9 rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] text-admin-text hover:bg-admin-bg"
            >
              다른 계정으로 로그인
            </button>
            <Link
              to="/home"
              className="text-[13px] text-admin-muted hover:text-admin-text hover:underline"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </AdminGate>
      )
    }
    return (
      <AdminGate>
        <div className="w-full max-w-sm">
          <AdminErrorMessage error={profile.error} onRetry={profile.refetch} />
        </div>
      </AdminGate>
    )
  }

  if (!profile.data) {
    return (
      <AdminGate>
        <div className="w-full max-w-sm">
          <AdminMessage text="확인 중이에요…" />
        </div>
      </AdminGate>
    )
  }

  return (
    <div className="flex h-screen min-w-[1024px] bg-admin-bg font-admin text-[14px] text-admin-text">
      <AdminSidebar profile={profile.data} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

/** 가드 판정 중·로그인 카드·차단 시 전면 배경 — 셸 밖이라 폰트·배경을 직접 두른다 */
function AdminGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-admin-bg p-6 font-admin text-admin-text">
      {children}
    </div>
  )
}
