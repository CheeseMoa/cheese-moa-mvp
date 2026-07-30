import type { Album, ID } from '../types/api'
import { sortAlbumsForDisplay } from './albumSort'

/**
 * 검토 동선 단일 원천(CHMO-521) — 09 [검토 완료] 후 "다음에 볼 앨범"을 정한다.
 *
 * 검토는 앨범 단위로 반복하는 작업이라 완료할 때마다 08로 나갔다 들어오면 왕복이 앨범 수만큼
 * 생긴다(CHMO-414 동작). 다음 앨범을 앱이 직접 열어 주면 검토가 한 줄기로 이어지고, 더 볼
 * 앨범이 없을 때가 곧 "공개할 차례"다(호출부가 14로 보낸다).
 *
 * 후보 규칙:
 * - **인물·공통만.** uncertain·eyes_closed·blurry는 검토 UI 자체가 없어(CHMO-357) 영영 미검토로
 *   남는다 — 후보에 넣으면 검토할 수단이 없는 앨범을 무한히 다시 열게 된다.
 * - **사진 0장 제외.** 빈 앨범은 잔류하지만(CHMO-418) 검토할 것이 없다.
 * - **`unreviewedPhotoCount`를 모르면 후보에서 뺀다.** 계약상 optional이라(목록 전용) 값이 없는
 *   응답에서 "미검토가 남았다"고 단정하지 않는다 — 09가 검토 상태를 손에 든 사진으로 직접
 *   판정하는 것과 같은 태도다.
 *
 * 순서는 08 그리드 표시 순서(`sortAlbumsForDisplay`)를 그대로 따르고 **현재 앨범 다음부터** 찾는다.
 * 끝까지 없으면 앞쪽으로 돌아 처음부터 — 그래서 어디서 검토를 시작했든 남은 앨범을 빠짐없이 훑는다.
 */
export function findNextReviewTarget(albums: Album[], currentAlbumId: ID): Album | null {
  const sorted = sortAlbumsForDisplay(albums)
  const currentIndex = sorted.findIndex((album) => album.id === currentAlbumId)
  // 현재 앨범을 뺀 나머지를 '다음부터 한 바퀴' 순서로 늘어놓는다. 목록에 현재 앨범이 없으면
  // (딥링크 진입·그새 삭제됨) 정렬 순서 그대로 훑되 자기 자신만 제외한다.
  const rotated =
    currentIndex >= 0
      ? [...sorted.slice(currentIndex + 1), ...sorted.slice(0, currentIndex)]
      : sorted.filter((album) => album.id !== currentAlbumId)
  return rotated.find(isReviewTarget) ?? null
}

/** 검토가 남은 앨범인가 — 09가 [검토 완료]를 띄우는 조건과 같은 범위(인물·공통·사진 보유) */
function isReviewTarget(album: Album): boolean {
  if (album.type !== 'person' && album.type !== 'common') return false
  if (album.photoCount <= 0) return false
  return album.unreviewedPhotoCount != null && album.unreviewedPhotoCount > 0
}
