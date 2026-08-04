import { Link, Navigate, Outlet } from 'react-router-dom'
import { getAccessToken } from '../lib/auth'
import { useApi } from '../hooks/useApi'
import { getAdminProfile } from './api/admin'
import { AdminSidebar } from './components/AdminSidebar'
import { AdminErrorMessage, AdminMessage } from './components/AdminMessage'

/**
 * 어드민 셸 + 진입 가드 (CHMO-379) — /admin/* 전체를 감싼다.
 *
 * 가드 판정은 GET /admin/me(CHMO-377 — BE가 명시한 FE 진입 게이트):
 * - 무토큰 → 서비스 로그인으로(관리자도 로그인은 서비스와 같은 계정·JWT다)
 * - 401(토큰 무효 — apiFetch가 이미 토큰 폐기) → 로그인으로
 * - 403(ADMIN403 = 관리자 아님) → 차단 화면. 기다려도 안 풀리는 권한 문제라 재시도가 없다
 * - 그 외(네트워크 등) → 재시도
 *
 * 데스크탑 레이아웃(1440 기준) — PhoneShell을 두르지 않고 사이드바 240 + 콘텐츠 칼럼.
 * 폭이 셸 없이도 성립하도록 min-w를 걸어 좁은 창에선 가로 스크롤로 둔다(내부 운영자 전용).
 */
export function AdminLayout() {
  const authed = Boolean(getAccessToken())
  const profile = useApi(authed ? 'admin-me' : null, (signal) => getAdminProfile(signal))

  if (!authed) {
    return <Navigate to="/login" replace />
  }

  if (profile.error) {
    if (profile.error.status === 401) {
      return <Navigate to="/login" replace />
    }
    if (profile.error.status === 403) {
      return (
        <AdminGate>
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-admin-border bg-admin-surface px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">관리자 권한이 필요해요</p>
            <p className="text-[13px] text-admin-muted">
              이 화면은 치즈모아 내부 운영자 전용이에요.
            </p>
            <Link
              to="/home"
              className="mt-1 h-9 rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] leading-9 text-admin-text hover:bg-admin-bg"
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

/** 가드 판정 중·차단 시 전면 배경 — 셸 밖이라 폰트·배경을 직접 두른다 */
function AdminGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-admin-bg p-6 font-admin text-admin-text">
      {children}
    </div>
  )
}
