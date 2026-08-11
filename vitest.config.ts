import { defineConfig } from 'vitest/config'

/**
 * api 계층 계약 테스트 전용 (CHMO-219).
 *
 * `environment: 'node'` — 화면 테스트(jsdom·RTL)는 범위 밖이다. 테스트가 검증하는 건
 * "실 BE가 이렇게 주면 화면은 이렇게 본다"이지 화면이 어떻게 그려지는지가 아니다.
 * vite.config.ts(react 플러그인·dev 프록시)는 쓰지 않는다 — 테스트는 fetch를 직접 스텁한다.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // vi.stubGlobal('fetch', …)를 테스트마다 자동 원복
    unstubGlobals: true,
    // 개발 기기의 .env.local(Amplitude 실키 — CHMO-662)이 테스트에 로드되면
    // "키가 없으면 완전 no-op" 계약 테스트의 전제가 기기마다 달라진다 — 빈 값으로 고정.
    // 키가 필요한 테스트는 vi.stubEnv로 명시적으로 심는다(analytics.test.ts 옵트아웃).
    env: { VITE_AMPLITUDE_API_KEY: '' },
  },
})
