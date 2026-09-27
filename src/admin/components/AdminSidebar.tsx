import { NavLink } from 'react-router-dom'
import { Cheddar } from '../../components/ui/Cheddar'
import type { AdminProfile } from '../api/types'

/**
 * 사이드바(어드민/사이드바 288:86) — 폭 240 고정·우측 1px 보더. 시안의 2차 자리 중
 * 기관 검수는 기관 문의(CHMO-811)로 앞당겨졌고, 유저·분석 모니터는 아직 없다(admin-spec §3-0).
 * 신고·문의(CHMO-862)는 처리 대기 건수를 라벨 곁 작은 수로 단다 — 옐로우 필은 '손댈 것이 있다'는
 * 신호라 1건 이상일 때만 그린다.
 * 로고는 서비스와 같은 체다 심볼 — 엠블럼 타일은 서비스에서 폐지돼(CHMO-512) 심볼 단독이다.
 * 하단 프로필 곁 [로그아웃](CHMO-595)은 서버 무효화 후 게이트 재판정 — 라우팅 이동 없이
 * 로그인 카드로 돌아간다(처리는 AdminLayout 소유).
 */
export function AdminSidebar({
  profile,
  pendingReportCount,
  onLogout,
}: {
  profile: AdminProfile
  /** 처리 대기 신고·문의 — 0이거나 모르면 배지를 그리지 않는다(CHMO-862) */
  pendingReportCount: number | null
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
        {/* 기관 문의는 매일 처리하는 일이라 조회 화면(모임)보다 위에 둔다 — CHMO-811 */}
        {/* 신고·문의는 사용자가 답을 기다리는 일이라 가장 위(대시보드 바로 아래) — CHMO-862 */}
        <SidebarLink
          to="/admin/reports"
          label="신고·문의"
          count={pendingReportCount}
          countLabel="처리 대기"
        />
        <SidebarLink to="/admin/inquiries" label="기관 문의" />
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

function SidebarLink({
  to,
  label,
  end,
  count,
  countLabel,
}: {
  to: string
  label: string
  end?: boolean
  /** 처리할 건수 — 1 이상일 때만 라벨 오른쪽에 작은 수를 단다 */
  count?: number | null
  /** 스크린리더용 — 수만 읽히면 무엇의 수인지 모른다 */
  countLabel?: string
}) {
  const showCount = typeof count === 'number' && count > 0
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={showCount ? `${label}, ${countLabel ?? ''} ${count}건` : undefined}
      className={({ isActive }) =>
        `mr-3 flex items-center justify-between gap-2 rounded-r-lg border-l-[3px] px-5 py-2.5 text-[14px] ${
          isActive
            ? 'border-primary bg-admin-nav font-semibold text-admin-text'
            : 'border-transparent text-admin-muted hover:bg-admin-bg hover:text-admin-text'
        }`
      }
    >
      <span>{label}</span>
      {showCount ? (
        <span
          aria-hidden="true"
          className="min-w-[1.25rem] rounded-full bg-primary px-1.5 py-px text-center text-[11px] font-semibold leading-4 text-admin-text"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </NavLink>
  )
}
