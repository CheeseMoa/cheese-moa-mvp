/**
 * useApi 응답 캐시 — 화면을 왕복할 때마다 처음부터 다시 받지 않게 한다(CHMO-401).
 *
 * 05→08→09→08처럼 오가는 동안 `group:*`·`event:*`·`event-albums:*`가 매번 새로 조회됐고,
 * 그동안 화면이 로딩 문구로 통째 갈아끼워져 "뚝뚝 끊긴다"는 인상을 만들었다.
 *
 * **신선도(fresh)를 두는 이유**는 순수 stale-while-revalidate로는 원래 증상이 안 사라지기
 * 때문이다 — 실 BE 썸네일 URL은 응답마다 새 presigned라(CHMO-465 실측) 백그라운드 갱신이
 * 돌면 `thumbnailUrl`이 통째로 바뀌어 **이미지가 다시 로드된다**. 그래서 짧은 재진입
 * (기본 30초)은 재요청 자체를 건너뛴다. CHMO-465가 URL을 안정화하면 이 값은 줄일 수 있다.
 *
 * **무효화는 전량이다**(`clearApiCache`) — 뮤테이션 성공(`useMutation`)·로그아웃·뷰어 토큰
 * 폐기가 부른다. 키별 정밀 무효화는 대상이 스무 곳 가까이라(이동·삭제·검토완료·업로드·공개·
 * 이벤트/모임 CRUD·승인/연결…) 한 곳만 빠뜨려도 그대로 stale 화면이 되는데, 쓰기는 드물고
 * 읽기 왕복은 잦아 전량 비우기로도 이득이 거의 그대로 남는다.
 */

interface CacheEntry {
  data: unknown
  /** 캐시에 들어온 시각(ms) — 신선도 판정 */
  storedAt: number
}

/** 이 시간 안의 재진입은 재요청조차 하지 않는다(즉시 그리고 끝) */
export const API_CACHE_FRESH_MS = 30_000

/**
 * 보관 상한 — 넘으면 가장 오래 손대지 않은 항목부터 버린다.
 * 한 세션에서 오가는 모임·이벤트·앨범 수를 넉넉히 덮으면서, 사진 URL이 실린 큰 응답이
 * 무한정 쌓이지 않게 하는 값.
 */
const MAX_ENTRIES = 60

/** 삽입 순서 = 최근 사용 순서(뒤가 최신) — Map의 순서 보장을 LRU로 쓴다 */
const cache = new Map<string, CacheEntry>()

export interface CachedApiValue<T> {
  data: T
  /** true면 재요청 없이 이 값만 쓴다 */
  fresh: boolean
}

export function readApiCache<T>(key: string): CachedApiValue<T> | null {
  const entry = cache.get(key)
  if (!entry) return null
  // 최근 사용으로 올린다(맨 뒤로 재삽입)
  cache.delete(key)
  cache.set(key, entry)
  return { data: entry.data as T, fresh: Date.now() - entry.storedAt < API_CACHE_FRESH_MS }
}

export function writeApiCache(key: string, data: unknown): void {
  cache.delete(key)
  cache.set(key, { data, storedAt: Date.now() })
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/**
 * 키 하나만 버린다 — `refetch()`가 쓴다. 명시적 재요청은 신선도와 무관하게 서버를 봐야 하는데,
 * 캐시를 지우고 요청을 태우면 "신선하면 건너뛴다"는 규칙과 부딪히지 않는다(플래그로 강제하면
 * StrictMode 이중 실행에서 한쪽이 플래그를 먹어 요청이 통째로 빠질 수 있다).
 */
export function invalidateApiCacheKey(key: string): void {
  cache.delete(key)
}

/**
 * 전부 버린다 — 뮤테이션 성공·로그아웃·뷰어 토큰 폐기.
 * 로그아웃에서 특히 중요하다: 안 비우면 다음에 로그인한 계정이 이전 계정의 모임 목록을
 * 한 프레임 본다(캐시가 즉시 그려지는 값이라서).
 */
export function clearApiCache(): void {
  cache.clear()
}
