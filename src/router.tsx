import { createBrowserRouter } from 'react-router-dom'
import { CreatorGuard, ViewerGuard } from './guards/RouteGuards'

// 제작자 화면
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { JoinPage } from './pages/JoinPage'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { GroupCreatePage } from './pages/GroupCreatePage'
import { GroupDetailPage } from './pages/GroupDetailPage'
import { InvitePage } from './pages/InvitePage'
import { EventDetailPage } from './pages/EventDetailPage'
import { PhotoUploadPage } from './pages/PhotoUploadPage'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { PublishReviewPage } from './pages/PublishReviewPage'

// 학부모(무로그인 뷰어) 화면
import { ViewerUnlockPage } from './pages/viewer/ViewerUnlockPage'
import { ViewerEventsPage } from './pages/viewer/ViewerEventsPage'
import { ViewerAlbumsPage } from './pages/viewer/ViewerAlbumsPage'
import { ViewerAlbumDetailPage } from './pages/viewer/ViewerAlbumDetailPage'

import { NotFoundPage } from './pages/NotFoundPage'

/**
 * 전체 라우트 정의 (docs/screen-spec.md 화면 매핑).
 * 제작자 경로는 CreatorGuard, 뷰어 경로는 ViewerGuard로 감싼다.
 */
export const router = createBrowserRouter([
  // ── 공개(비로그인 진입) ──────────────────────────────
  { path: '/', element: <LandingPage /> }, // 01 로그인 진입
  { path: '/login', element: <LoginPage /> }, // 01-1 로그인
  { path: '/signup', element: <SignupPage /> }, // 01-2 계정 생성
  { path: '/join/:joinKey', element: <JoinPage /> }, // 02-1 모임 참여(초대 링크 진입)

  // ── 제작자(로그인) ──────────────────────────────────
  {
    element: <CreatorGuard />,
    children: [
      { path: '/home', element: <HomePage /> }, // 02 홈/내 모임
      { path: '/settings', element: <SettingsPage /> }, // 설정/프로필 편집
      { path: '/groups/new', element: <GroupCreatePage /> }, // 03 모임 만들기
      { path: '/groups/:groupId', element: <GroupDetailPage /> }, // 05 모임 상세(이벤트 목록)
      { path: '/groups/:groupId/invite', element: <InvitePage /> }, // 초대(선생님 초대)
      { path: '/groups/:groupId/events/:eventId', element: <EventDetailPage /> }, // 06-E / 08
      { path: '/groups/:groupId/events/:eventId/upload', element: <PhotoUploadPage /> }, // 06-U
      {
        path: '/groups/:groupId/events/:eventId/albums/:albumId',
        element: <AlbumDetailPage />,
      }, // 09 앨범 상세
      { path: '/groups/:groupId/events/:eventId/publish', element: <PublishReviewPage /> }, // 14 공개 전 검수
    ],
  },

  // ── 학부모(무로그인 뷰어) ────────────────────────────
  { path: '/share/:token', element: <ViewerUnlockPage /> }, // 잠금 해제
  {
    element: <ViewerGuard />,
    children: [
      { path: '/share/:token/events', element: <ViewerEventsPage /> }, // 15-L 공개 이벤트 목록
      { path: '/share/:token/events/:eventId', element: <ViewerAlbumsPage /> }, // 15 공개 이벤트 앨범
      {
        path: '/share/:token/events/:eventId/albums/:albumId',
        element: <ViewerAlbumDetailPage />,
      }, // 16 인물 앨범 상세
    ],
  },

  // ── 개발용: 공용 컴포넌트 데모 (DEV 전용, 프로덕션 번들 제외) ──
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/components',
          lazy: async () => ({
            Component: (await import('./pages/dev/ComponentGalleryPage')).ComponentGalleryPage,
          }),
        },
      ]
    : []),

  // ── 404 ─────────────────────────────────────────────
  { path: '*', element: <NotFoundPage /> },
])
