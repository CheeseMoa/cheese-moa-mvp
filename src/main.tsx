import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
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
      <RouterProvider router={router} />
    </React.StrictMode>,
  )
}

// 목 API 초기화는 베스트 에포트 — 실패해도 앱은 항상 렌더한다(흰 화면 방지).
async function main() {
  try {
    await enableMocking()
  } catch (err) {
    console.error('[MSW] 목 API 초기화 실패 — 목 없이 계속 진행합니다.', err)
  }
  renderApp()
}

void main()
