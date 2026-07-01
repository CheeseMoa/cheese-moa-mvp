import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** 브라우저 환경 MSW 워커 (main.tsx에서 VITE_ENABLE_MSW='true'일 때 start) */
export const worker = setupWorker(...handlers)
