import { vi } from 'vitest'

/**
 * fetch 스텁 (CHMO-219).
 *
 * MSW 핸들러를 서버로 놓고 테스트하지 않는다 — "목이 목을 검증"하는 꼴이고, 목을 갈아엎는
 * CHMO-195가 테스트까지 함께 무너뜨린다. 대신 fetch를 대체하고 실 BE 응답 원문을 박아
 * *"실 BE가 이렇게 주면 화면은 이렇게 본다"*를 고정한다.
 */

/** 스텁이 기록하는 요청 — Authorization·Content-Type·본문까지 계약의 일부다 */
export interface FetchCall {
  url: string
  method: string
  headers: Headers
  /** JSON 본문(문자열). File 등 비문자열 본문은 rawBody로 */
  body: string | null
  rawBody: unknown
}

type FetchRoute = (call: FetchCall) => Response | Promise<Response>

/** globalThis.fetch를 대체하고 오간 요청을 순서대로 기록한다(vitest unstubGlobals가 원복) */
export function stubFetch(route: FetchRoute): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', async (input: unknown, init: RequestInit = {}) => {
    const call: FetchCall = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? init.body : null,
      rawBody: init.body,
    }
    calls.push(call)
    return route(call)
  })
  return calls
}

/** BE·MSW 공통 — JSON 응답(client.ts는 Content-Type으로 파싱 여부를 정한다) */
export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 본문 없는 응답(204 등) */
export function emptyResponse(status = 204): Response {
  return new Response(null, { status })
}

/** 봉투도 error 포맷도 아닌 실패(프록시·게이트웨이 오류) */
export function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

/** 기록된 요청의 JSON 본문 */
export function bodyOf(call: FetchCall | undefined): unknown {
  return call?.body ? JSON.parse(call.body) : null
}
