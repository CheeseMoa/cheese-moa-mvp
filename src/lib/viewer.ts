/**
 * 학부모(무로그인 뷰어) 토큰 저장 — 모임 공유 token별로 분리 저장.
 * (docs/api-spec.md §5: 뷰어 토큰은 모임 공유 token별 분리)
 * 모임명도 함께 캐시한다 — BE는 모임명을 unlock 응답에만 주고
 * 공개 이벤트 목록(GET /share/:token)엔 없다(CHMO-192 항목 9).
 */

const VIEWER_TOKENS_KEY = 'cheesemoa.viewerTokens'
const VIEWER_GROUP_NAMES_KEY = 'cheesemoa.viewerGroupNames'

/** shareToken → 값(viewerToken 또는 모임명) */
type ShareTokenMap = Record<string, string>

function readMap(storageKey: string): ShareTokenMap {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as ShareTokenMap) : {}
  } catch {
    return {}
  }
}

function writeMap(storageKey: string, map: ShareTokenMap): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map))
  } catch {
    /* noop */
  }
}

export function getViewerToken(shareToken: string): string | null {
  return readMap(VIEWER_TOKENS_KEY)[shareToken] ?? null
}

export function setViewerToken(shareToken: string, viewerToken: string): void {
  const map = readMap(VIEWER_TOKENS_KEY)
  map[shareToken] = viewerToken
  writeMap(VIEWER_TOKENS_KEY, map)
}

/** 토큰과 함께 캐시된 모임명도 지운다 — 재해제(unlock)가 다시 채운다 */
export function clearViewerToken(shareToken: string): void {
  const tokens = readMap(VIEWER_TOKENS_KEY)
  delete tokens[shareToken]
  writeMap(VIEWER_TOKENS_KEY, tokens)
  const names = readMap(VIEWER_GROUP_NAMES_KEY)
  delete names[shareToken]
  writeMap(VIEWER_GROUP_NAMES_KEY, names)
}

export function getViewerGroupName(shareToken: string): string | null {
  return readMap(VIEWER_GROUP_NAMES_KEY)[shareToken] ?? null
}

export function setViewerGroupName(shareToken: string, groupName: string): void {
  if (!groupName) return
  const map = readMap(VIEWER_GROUP_NAMES_KEY)
  map[shareToken] = groupName
  writeMap(VIEWER_GROUP_NAMES_KEY, map)
}
