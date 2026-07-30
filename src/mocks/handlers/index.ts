import type { RequestHandler } from 'msw'
import { authHandlers } from './auth'
import { agreementHandlers } from './agreements'
import { groupHandlers } from './groups'
import { eventHandlers } from './events'
import { albumHandlers } from './albums'
import { parentHandlers } from './parents'
import { shareHandlers } from './share'

/**
 * MSW 목 핸들러 집합 (docs/api-spec.md 계약 기준).
 * CHMO-108: auth · groups · events(+presign/analyze/analysis).
 * CHMO-109: events(+review-summary/publish) · albums(검수) · share(학부모 뷰어).
 * CHMO-444: parents(학부모 전환 — 합류 승인·멤버·인물 매핑·학부모 사진, 초안 계약).
 * CHMO-516: agreements(약관 동의 기록·보호자 동의 확보 확인 — BE CHMO-514 계약).
 * parents가 events보다 먼저 — /events/:id/parent-photos가 /events/:id 계열 뒤에 서면 안 되는 건
 * 아니지만(MSW는 경로 전체 일치), 신설 경로를 한 곳에서 먼저 보이게 둔다.
 */
export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...agreementHandlers,
  ...groupHandlers,
  ...parentHandlers,
  ...eventHandlers,
  ...albumHandlers,
  ...shareHandlers,
]
