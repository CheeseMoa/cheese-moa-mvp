import type { RequestHandler } from 'msw'

/**
 * MSW 목 핸들러 자리.
 * 실제 엔드포인트별 핸들러/픽스처는 후속 스토리에서 docs/api-spec.md 계약에 맞춰 추가한다.
 */
export const handlers: RequestHandler[] = []
