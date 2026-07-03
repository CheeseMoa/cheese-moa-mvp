import type { RequestHandler } from 'msw'
import { authHandlers } from './auth'
import { groupHandlers } from './groups'
import { eventHandlers } from './events'

/**
 * MSW 목 핸들러 집합 (docs/api-spec.md 계약 기준).
 * CHMO-108: auth · groups · events(+presign/analyze/analysis).
 * 앨범·검수·공개·뷰어 핸들러는 CHMO-109에서 추가한다.
 */
export const handlers: RequestHandler[] = [...authHandlers, ...groupHandlers, ...eventHandlers]
