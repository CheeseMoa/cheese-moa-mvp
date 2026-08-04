import { NavLink } from 'react-router-dom'
import { Cheddar } from '../../components/ui/Cheddar'
import type { AdminProfile } from '../api/types'

/**
 * 사이드바(어드민/사이드바 288:86) — 폭 240 고정·우측 1px 보더. 1차 메뉴는 대시보드·모임뿐이고
 * 시안의 2차 자리(유저·분석 모니터·기관 검수)는 구현하지 않는다(admin-spec §3-0).
 * 로고는 서비스와 같은 체다 심볼 — 엠블럼 타일은 서비스에서 폐지돼(CHMO-512) 심볼 단독이다.
 * 하단 프로필 곁 [로그아웃](CHMO-595)은 서버 무효화 후 게이트 재판정 — 라우팅 이동 없이
 * 로그인 카드로 돌아간다(처리는 AdminLayout 소유).
 */
export function AdminSidebar({
  profile,
  onLogout,
}: {
  profile: AdminProfile
  onLogout: () => void
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-admin-border bg-admin-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Cheddar size={30} />
        <div className="leading-tight">
          <div className="text-[15px] font-bold text-heading">치즈모아</div>
          <div className="text-[11px] text-admin-muted">관리자</div>
        </div>
      </div>

      <nav className="mt-1 flex flex-col gap-1" aria-label="관리자 메뉴">
        <SidebarLink to="/admin" end label="대시보드" />
        <SidebarLink to="/admin/groups" label="모임" />
      </nav>

      <div className="mt-auto border-t border-admin-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 shrink-0 rounded-full bg-admin-bg" aria-hidden="true" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-semibold">{profile.nickname}</div>
            <div className="text-[11px] text-admin-muted">운영자</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 text-xs text-admin-muted hover:text-admin-text hover:underline"
          >
            로그아웃
          </button>
        </div>
      </div>
    </aside>
  )
}

function SidebarLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `mr-3 rounded-r-lg border-l-[3px] px-5 py-2.5 text-[14px] ${
          isActive
            ? 'border-primary bg-admin-nav font-semibold text-admin-text'
            : 'border-transparent text-admin-muted hover:bg-admin-bg hover:text-admin-text'
        }`
      }
    >
      {label}
    </NavLink>
  )
}
