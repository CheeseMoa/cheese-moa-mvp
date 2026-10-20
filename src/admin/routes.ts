import { redirect, type RouteObject } from 'react-router-dom'
import { isAdminHost } from '../lib/appHost'

/** 관리자 호스트는 루트, 기존 앱·로컬 개발은 /admin에 마운트한다. */
export function createAdminRoutes(basePath: string): RouteObject[] {
  return [
    {
      path: basePath,
      lazy: async () => ({ Component: (await import('./AdminLayout')).AdminLayout }),
      children: [
        {
          index: true,
          lazy: async () => ({
            Component: (await import('./pages/AdminDashboardPage')).AdminDashboardPage,
          }),
        },
        {
          path: 'reports',
          lazy: async () => ({
            Component: (await import('./pages/AdminReportsPage')).AdminReportsPage,
          }),
        }, // 신고·문의 — 목록·상세 패널·답변(CHMO-862 · BE CHMO-861)
        {
          path: 'inquiries',
          lazy: async () => ({
            Component: (await import('./pages/AdminInquiriesPage')).AdminInquiriesPage,
          }),
        }, // 기관 도입 문의 — 어드민의 첫 쓰기 화면(CHMO-811)
        {
          path: 'organizations',
          lazy: async () => ({
            Component: (await import('./pages/AdminOrganizationsPage')).AdminOrganizationsPage,
          }),
        }, // 기관 구독 — 접근 상태·이용 기간 등록(CHMO-931 · BE CHMO-912)
        {
          path: 'users',
          lazy: async () => ({
            Component: (await import('./pages/AdminUsersPage')).AdminUsersPage,
          }),
        }, // 사용자 검색(CHMO-931)
        {
          path: 'users/:userId',
          lazy: async () => ({
            Component: (await import('./pages/AdminUserDetailPage')).AdminUserDetailPage,
          }),
        }, // 사용자 상세 — 무료 사진 장수·장부·기관 이용 기간(CHMO-931)
        {
          path: 'popups',
          lazy: async () => ({
            Component: (await import('./pages/AdminPopupsPage')).AdminPopupsPage,
          }),
        }, // 이벤트 팝업 목록(CHMO-928 · BE CHMO-926)
        {
          // 작성(`new` — 복제는 `?from=:id`)과 수정(`:popupId`)이 같은 화면이다
          path: 'popups/new',
          lazy: async () => ({
            Component: (await import('./pages/AdminPopupEditPage')).AdminPopupEditPage,
          }),
        },
        {
          path: 'popups/:popupId',
          lazy: async () => ({
            Component: (await import('./pages/AdminPopupEditPage')).AdminPopupEditPage,
          }),
        },
        {
          path: 'push',
          lazy: async () => ({
            Component: (await import('./pages/AdminPushPage')).AdminPushPage,
          }),
        }, // 혜택 푸시 발송 — Firebase 콘솔 수동 발송 대체(CHMO-928)
        {
          path: 'operation-settings',
          lazy: async () => ({
            Component: (await import('./pages/AdminOperationSettingsPage'))
              .AdminOperationSettingsPage,
          }),
        },
        {
          path: 'groups',
          lazy: async () => ({
            Component: (await import('./pages/AdminGroupsPage')).AdminGroupsPage,
          }),
        },
        {
          path: 'groups/:groupId',
          lazy: async () => ({
            Component: (await import('./pages/AdminGroupDetailPage')).AdminGroupDetailPage,
          }),
        },
      ],
    },
  ]
}

/** 관리자 도메인에는 서비스 라우트를 등록하지 않는다. */
export function routesForHost(hostname: string, applicationRoutes: RouteObject[]): RouteObject[] {
  if (!isAdminHost(hostname)) return applicationRoutes
  return [
    {
      path: '/admin/*',
      loader: ({ request }) => {
        const url = new URL(request.url)
        return redirect(
          `${url.pathname.replace(/^\/admin(?:\/+|$)/i, '/')}${url.search}${url.hash}`,
        )
      },
    },
    ...createAdminRoutes('/'),
    {
      path: '*',
      loader: () => redirect('/'),
    },
  ]
}
