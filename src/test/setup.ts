import { beforeEach } from 'vitest'
import { clearAuthTokens } from '../lib/auth'

/**
 * node 환경엔 localStorage가 없다. 토큰 저장(lib/auth·lib/viewer)이 실제로 쓰는 API라
 * 목으로 우회하지 않고 메모리 구현을 심는다 — 저장·삭제 동작 자체가 검증 대상이다.
 */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      entries.set(key, String(value))
    },
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createMemoryStorage(),
  configurable: true,
})

beforeEach(() => {
  localStorage.clear()
  // lib/auth는 localStorage 앞에 메모리 캐시를 둔다 — 지우지 않으면 토큰이 테스트 간에 샌다.
  clearAuthTokens()
})
