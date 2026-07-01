/**
 * 학부모(무로그인 뷰어) 토큰 저장 — 모임 공유 token별로 분리 저장.
 * (docs/api-spec.md §5: 뷰어 토큰은 모임 공유 token별 분리)
 */

const VIEWER_TOKENS_KEY = 'cheesemoa.viewerTokens'

/** shareToken → viewerToken */
type ViewerTokenMap = Record<string, string>

function readMap(): ViewerTokenMap {
  try {
    const raw = localStorage.getItem(VIEWER_TOKENS_KEY)
    return raw ? (JSON.parse(raw) as ViewerTokenMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: ViewerTokenMap): void {
  try {
    localStorage.setItem(VIEWER_TOKENS_KEY, JSON.stringify(map))
  } catch {
    /* noop */
  }
}

export function getViewerToken(shareToken: string): string | null {
  return readMap()[shareToken] ?? null
}

export function setViewerToken(shareToken: string, viewerToken: string): void {
  const map = readMap()
  map[shareToken] = viewerToken
  writeMap(map)
}

export function clearViewerToken(shareToken: string): void {
  const map = readMap()
  delete map[shareToken]
  writeMap(map)
}
