/** 호스트 이름을 정확히 비교해 공개 앱·프리뷰를 관리자 호스트로 오인하지 않는다. */
export function isAdminHost(hostname: string = window.location.hostname): boolean {
  return hostname === (import.meta.env.VITE_ADMIN_HOST || 'admin.cheese-moa.com')
}
