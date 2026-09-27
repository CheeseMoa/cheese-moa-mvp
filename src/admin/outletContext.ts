import { useOutletContext } from 'react-router-dom'

/**
 * 어드민 셸(AdminLayout)이 하위 화면에 내려 주는 값 (CHMO-862).
 *
 * 처리 대기 신고·문의 건수는 **셸이 한 번만 조회한다** — 사이드바 배지와 대시보드 카드가 같은
 * 수를 보여 주는데 둘이 각자 부르면 대시보드 진입마다 같은 요청이 두 번 나간다. 신고·문의 화면이
 * 답변·전이에 성공하면 `refreshPendingReports`로 배지를 즉시 맞춘다(안 그러면 방금 처리한 건이
 * 다음 화면 이동 때까지 배지에 남는다).
 */
export interface AdminOutletContext {
  /** 모르면 null — 0으로 채우면 "없다"는 거짓말이 된다(어드민 '—' 규칙) */
  pendingReportCount: number | null
  refreshPendingReports: () => void
}

export function useAdminOutlet(): AdminOutletContext {
  return useOutletContext<AdminOutletContext>()
}
