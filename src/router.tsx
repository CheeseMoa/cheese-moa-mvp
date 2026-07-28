import { createBrowserRouter } from 'react-router-dom'
import { CreatorGuard, GuestGuard, ViewerGuard } from './guards/RouteGuards'

// 제작자 화면
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { SocialCallbackPage } from './pages/SocialCallbackPage'
import { JoinPage } from './pages/JoinPage'
import { HomePage } from './pages/HomePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { SettingsPage } from './pages/SettingsPage'
import { GroupCreatePage } from './pages/GroupCreatePage'
import { GroupDetailPage } from './pages/GroupDetailPage'
import { InviteManagePage } from './pages/InviteManagePage'
import { EventDetailPage } from './pages/EventDetailPage'
import { PhotoUploadPage } from './pages/PhotoUploadPage'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { PublishReviewPage } from './pages/PublishReviewPage'

// 학부모(로그인 멤버) 화면 — CHMO-448
import { ParentGroupPage } from './pages/ParentGroupPage'
import { ParentEventPhotosPage } from './pages/ParentEventPhotosPage'

// 학부모(무로그인 뷰어) 화면
import { ViewerUnlockPage } from './pages/viewer/ViewerUnlockPage'
import { ViewerEventsPage } from './pages/viewer/ViewerEventsPage'
import { ViewerAlbumsPage } from './pages/viewer/ViewerAlbumsPage'
import { ViewerAlbumDetailPage } from './pages/viewer/ViewerAlbumDetailPage'

import { NotFoundPage } from './pages/NotFoundPage'

// 약관·정책 전문 (CHMO-478)
import { LegalDocPage } from './pages/LegalDocPage'
import { termsOfService } from './legal/terms'
import { privacyPolicy } from './legal/privacy'
import { biometricNotice } from './legal/biometric'

/**
 * 전체 라우트 정의 (docs/screen-spec.md 화면 매핑).
 * 제작자 경로는 CreatorGuard, 뷰어 경로는 ViewerGuard로 감싼다.
 */
export const router = createBrowserRouter([
  // ── 공개(비로그인 진입) — 토큰 보유 시 GuestGuard가 /home으로 ──
  {
    element: <GuestGuard />,
    children: [
      { path: '/', element: <LandingPage /> }, // 01 로그인 진입
      { path: '/login', element: <LoginPage /> }, // 01-1 로그인
      { path: '/signup', element: <SignupPage /> }, // 01-2 계정 생성
    ],
  },
  { path: '/join/:joinKey', element: <JoinPage /> }, // 02-1 모임 참여(초대 링크 진입) — 로그인 제작자도 사용하므로 GuestGuard 밖
  { path: '/auth/callback', element: <SocialCallbackPage /> }, // 01-C 소셜 로그인 콜백(CHMO-359) — BE 리다이렉트 착지라 가드 밖

  // ── 약관·정책 전문 — 설정·동의 화면·외부 공개 URL(스토어 심사 등) 공용이라 가드 밖 (CHMO-478) ──
  { path: '/legal/terms', element: <LegalDocPage doc={termsOfService} /> },
  { path: '/legal/privacy', element: <LegalDocPage doc={privacyPolicy} /> },
  { path: '/legal/biometric', element: <LegalDocPage doc={biometricNotice} /> },

  // ── 제작자(로그인) ──────────────────────────────────
  {
    element: <CreatorGuard />,
    children: [
      { path: '/home', element: <HomePage /> }, // 02 홈/내 모임
      // 00 첫 사용 온보딩 슬라이드(CHMO-481) — **현재 노출하지 않는다**(CHMO-504, 2026-07-28):
      // 첫 로그인 안내는 홈 위 '치즈모아 둘러보기'(00-T)가 맡고 슬라이드로 보내는 진입점은 없앴다.
      // 화면·라우트는 되살릴 수 있게 남겨 둔다(직접 URL로만 열린다).
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '/settings', element: <SettingsPage /> }, // 설정/프로필 편집
      { path: '/groups/new', element: <GroupCreatePage /> }, // 03 모임 만들기
      { path: '/groups/:groupId', element: <GroupDetailPage /> }, // 05 모임 상세(이벤트 목록) — 초대·학부모 공유 시트 포함
      { path: '/groups/:groupId/invites', element: <InviteManagePage /> }, // 20 초대 관리(CHMO-447) — 20-1 아이 연결 시트 포함
      { path: '/groups/:groupId/events/:eventId', element: <EventDetailPage /> }, // 06-E / 08
      { path: '/groups/:groupId/events/:eventId/upload', element: <PhotoUploadPage /> }, // 06-U
      {
        path: '/groups/:groupId/events/:eventId/albums/:albumId',
        element: <AlbumDetailPage />,
      }, // 09 앨범 상세
      { path: '/groups/:groupId/events/:eventId/publish', element: <PublishReviewPage /> }, // 14 공개 요약
      // 학부모(ACTIVE PARENT) 조회 — 홈 카드가 role로 분기해 진입(CHMO-448)
      { path: '/parent/groups/:groupId', element: <ParentGroupPage /> }, // 18 학부모 모임 상세
      { path: '/parent/groups/:groupId/events/:eventId', element: <ParentEventPhotosPage /> }, // 19 학부모 사진 그리드
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
