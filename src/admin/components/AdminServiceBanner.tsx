import { Link, useLocation } from 'react-router-dom'
import { adminPath } from '../paths'
import { serviceModeLabel } from '../lib/serviceStatus'

/**
 * 읽기 전용 운영 띠 (CHMO-994 AC-4) — 어드민 모든 화면의 상단바 위에 건다. 켜 둔 채 잊지 않게
 * 하는 알림이라 경고색이 아니라 어드민 포인트 색(치즈 옐로) 면이다(카피 톤 · 겁주지 않는다).
 */
export function AdminServiceBanner({ mode }: { mode: string }) {
  const { pathname } = useLocation()
  const settingsPath = adminPath('/operation-settings')
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-between gap-3 bg-primary px-7 py-2 text-[13px] text-admin-text"
    >
      <p>
        <strong className="font-semibold">
          {mode === 'READ_ONLY' ? '읽기 전용 운영 중' : `${serviceModeLabel(mode)} 운영 중`}
        </strong>
        <span aria-hidden="true"> · </span>
        사용자는 사진 보기·저장만 할 수 있어요
      </p>
      {pathname !== settingsPath && (
        <Link to={settingsPath} className="shrink-0 font-semibold underline">
          운영 설정에서 확인
        </Link>
      )}
    </div>
  )
}
