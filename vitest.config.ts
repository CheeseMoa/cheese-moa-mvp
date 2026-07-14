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
  },
})
