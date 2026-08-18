import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ToastProvider } from './components/ui'
import {
  endScreenSession,
  initAnalytics,
  resumeScreenSession,
  trackAppFirstOpen,
  trackScreen,
} from './lib/analytics'
import { startPushTokenSync } from './lib/push'
import './index.css'

/**
 * MSW 목 API 부트스트랩 자리.
 * VITE_ENABLE_MSW='true'일 때만 워커를 시작한다(핸들러는 후속 스토리에서 추가).
 */
async function enableMocking() {
  if (import.meta.env.VITE_ENABLE_MSW !== 'true') return
  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </React.StrictMode>,
  )
}

/**
 * 사용자 행동 추적 부트스트랩 (CHMO-660) — 키가 없으면 전부 no-op다.
 *
 * 화면 진입은 `router.subscribe`로 잡는다. 라우터 안에 추적용 컴포넌트를 끼우려면
 * 최상위 라우트 전부를 한 겹 감싸야 하는데(진입점이 가드별로 갈려 공통 부모가 없다),
 * 구독은 router.tsx를 건드리지 않고 같은 일을 한다. subscribe는 최초 상태로는 불리지
 * 않으므로 첫 화면만 직접 넣어 준다(중복은 trackScreen이 화면 코드로 걸러낸다).
 */
function startAnalytics() {
  // SDK는 동적 import라 도착까지 시간이 걸린다 — 기다리지 않는다(렌더를 막을 이유가 없다).
  // 그 사이 발생한 이벤트는 analytics가 큐에 담았다가 초기화 끝에 흘려보낸다.
  void initAnalytics()
  // 앱 첫 실행 (CHMO-704) — 기기당 1회. 브라우저에서는 아무것도 하지 않는다.
  // 첫 화면 기록보다 앞에 두는 건 순서 자체가 뜻을 갖기 때문이다(앱이 열렸고 → 이 화면을 봤다).
  trackAppFirstOpen()
  trackScreen(window.location.pathname)
  router.subscribe((state) => trackScreen(state.location.pathname))

  // 화면 체류 마감 (CHMO-691) — 화면 이동은 위 구독이 마감하지만, **앱을 떠나며 보고 있던
  // 마지막 화면**은 아무도 마감해 주지 않는다. 그게 곧 이탈 지점이라 가장 중요한 한 건이다.
  //
  // 두 신호를 함께 듣는 이유: `pagehide`는 탭 닫기·이동·bfcache 진입을 덮지만 앱 웹뷰가
  // 홈 버튼으로 접힐 때는 안 오고, `visibilitychange`는 그 경우를 받는다. 겹쳐 와도
  // emitScreenLeave가 한 번만 마감하므로(마감 후 타이머 null) 중복 계상되지 않는다.
  window.addEventListener('pagehide', endScreenSession)
  document.addEventListener('visibilitychange', () => {
    // 돌아왔을 때 다시 세지 않으면 접어 둔 시간이 통째로 체류로 잡힌다
    if (document.visibilityState === 'hidden') endScreenSession()
    else resumeScreenSession()
  })
}

// 목 API 초기화는 베스트 에포트 — 실패해도 앱은 항상 렌더한다(흰 화면 방지).
async function main() {
  try {
    await enableMocking()
  } catch (err) {
    console.error('[MSW] 목 API 초기화 실패 — 목 없이 계속 진행합니다.', err)
  }
  // 추적도 같은 원칙 — 실패해도 화면은 뜬다(분석 때문에 앱이 안 열리는 일은 없어야 한다)
  try {
    startAnalytics()
  } catch (err) {
    console.error('[analytics] 초기화 실패 — 추적 없이 계속 진행합니다.', err)
  }
  // FCM 토큰 회전 구독 (CHMO-667) — 앱 생애 1회. 브라우저에선 이벤트가 오지 않아 무해하고,
  // 해제할 일이 없어(앱이 살아 있는 내내 유효) 반환된 구독 해제 함수를 버린다
  try {
    startPushTokenSync()
  } catch (err) {
    console.error('[push] 토큰 동기화 구독 실패 — 알림 없이 계속 진행합니다.', err)
  }
  renderApp()
}

void main()
