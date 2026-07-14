import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'
import { seedDb } from './db'
import { createFixtures } from './fixtures'
import { restorePersistedUsers } from './persist'

// 워커 기동 전에 인메모리 스토어를 픽스처로 시드(새로고침마다 초기화)
seedDb(createFixtures())
// 가입으로 생긴 계정은 localStorage에 보존돼 있다가 시드 직후 합류(새로고침 후 401 방지)
restorePersistedUsers()

/** 브라우저 환경 MSW 워커 (main.tsx에서 VITE_ENABLE_MSW='true'일 때 start) */
export const worker = setupWorker(...handlers)
