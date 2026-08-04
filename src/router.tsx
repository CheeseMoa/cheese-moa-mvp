import { createBrowserRouter } from 'react-router-dom'
import { CreatorGuard, GuestGuard, ViewerGuard } from './guards/RouteGuards'

// 제작자 화면
import { LandingPage } from './pages/LandingPage'
import { SocialCallbackPage } from './pages/SocialCallbackPage'
import { JoinPage } from './pages/JoinPage'
import { HomePage } from './pages/HomePage'
import { SignupConsentPage } from './pages/SignupConsentPage'
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

// 계정 삭제·데이터 삭제 안내 (CHMO-588)
import { AccountDeletionPage, DataDeletionPage } from './pages/DeletionGuidePage'

/**
 * 전체 라우트 정의 (docs/screen-spec.md 화면 매핑).
 * 제작자 경로는 CreatorGuard, 뷰어 경로는 ViewerGuard로 감싼다.
 */
export const router = createBrowserRouter([
  // ── 공개(비로그인 진입) — 토큰 보유 시 GuestGuard가 /home으로 ──
  {
    element: <GuestGuard />,
    children: [
      { path: '/', element: <LandingPage /> }, // 01 로그인 진입(소셜 단일 — CHMO-557)
      // /login도 01을 그린다 — 앱 전역 401 복귀 목적지(가드·unauthorizedTo)·JoinPage returnTo
      // 착지가 이 경로를 보므로, 닉네임+PIN 화면(01-1·01-2)을 내리며 라우트만 남겼다(CHMO-557)
      { path: '/login', element: <LandingPage /> },
    ],
  },
  { path: '/join/:joinKey', element: <JoinPage /> }, // 02-1 모임 참여(초대 링크 진입) — 로그인 제작자도 사용하므로 GuestGuard 밖
  { path: '/auth/callback', element: <SocialCallbackPage /> }, // 01-C 소셜 로그인 콜백(CHMO-359) — BE 리다이렉트 착지라 가드 밖

  // ── 약관·정책 전문 — 설정·동의 화면·외부 공개 URL(스토어 심사 등) 공용이라 가드 밖 (CHMO-478) ──
  { path: '/legal/terms', element: <LegalDocPage doc={termsOfService} /> },
  { path: '/legal/privacy', element: <LegalDocPage doc={privacyPolicy} /> },
  { path: '/legal/biometric', element: <LegalDocPage doc={biometricNotice} /> },

  // ── 계정 삭제·데이터 삭제 안내 — Google Play 삭제 URL 요건, 스토어 등록정보에 실리는
  //    공개 URL이라 가드 밖 (CHMO-588) ──
  { path: '/account-deletion', element: <AccountDeletionPage /> },
  { path: '/data-deletion', element: <DataDeletionPage /> },

  // ── 제작자(로그인) ──────────────────────────────────
  {
    element: <CreatorGuard />,
    children: [
      { path: '/home', element: <HomePage /> }, // 02 홈/내 모임
      // 01-A 가입 동의(CHMO-479) — 로그인 성공 시점(01-C·DEV 로그인)의 게이트 판정이 보낸다.
      // 제출(POST /agreements)에 토큰이 필요해 가드 안이고, 이미 전부 동의된 계정의 직접
      // 진입은 화면이 스스로 홈으로 돌려보낸다
      { path: '/consent', element: <SignupConsentPage /> },
      // 00 첫 사용 온보딩 슬라이드(CHMO-481) — **현재 노출하지 않는다**(CHMO-504, 2026-07-28):
      // 첫 안내는 실제 화면의 코치 힌트가 맡고(CHMO-565·578) 슬라이드로 보내는 진입점은 없앴다.
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

  // ── 개발용 (DEV 전용, 프로덕션 번들 제외) ──
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/components',
          lazy: async () => ({
            Component: (await import('./pages/dev/ComponentGalleryPage')).ComponentGalleryPage,
          }),
        },
        // 닉네임+PIN 로그인(CHMO-557) — 실 BE test 계정·목 시드 확인용 개발 입구, 01 랜딩 DEV 링크로 진입
        {
          path: '/dev/login',
          lazy: async () => ({
            Component: (await import('./pages/dev/DevLoginPage')).DevLoginPage,
          }),
        },
      ]
    : []),

  // ── 404 ─────────────────────────────────────────────
  { path: '*', element: <NotFoundPage /> },
])
