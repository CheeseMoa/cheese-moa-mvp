import type { RequestHandler } from 'msw'
import { authHandlers } from './auth'
import { groupHandlers } from './groups'
import { eventHandlers } from './events'
import { albumHandlers } from './albums'
import { shareHandlers } from './share'

/**
 * MSW 목 핸들러 집합 (docs/api-spec.md 계약 기준).
 * CHMO-108: auth · groups · events(+presign/analyze/analysis).
 * CHMO-109: events(+review-summary/publish) · albums(검수) · share(학부모 뷰어).
 */
export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...groupHandlers,
  ...eventHandlers,
  ...albumHandlers,
  ...shareHandlers,
]
