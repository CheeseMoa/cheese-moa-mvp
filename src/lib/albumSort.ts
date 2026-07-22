import type { AlbumType, ID } from '../types/api'
import { UNNAMED_PERSON_LABEL } from './albumLabels'

/**
 * 앨범 표시 정렬 단일 원천(CHMO-411) — 08 그리드·14 미리보기·15 뷰어 공용.
 * 서버 응답 순서는 화면 기준이 아니다: 실 BE는 미검토 앨범 우선(CHMO-336)이라 타입이
 * 섞이고 검토 완료하면 앨범이 뒤로 튄다. 표시 순서는 화면(FE)이 소유한다(2026-07-22 확정).
 *
 * 규칙: 인물(이름 가나다순, '이름 없음'은 인물 뒤) → 공통 → 분류가 어려워요 → 눈감음 →
 * 흔들림. 검토 상태와 무관하게 고정 — 검토·재조회에도 앨범 위치가 바뀌지 않는다.
 */
const TYPE_ORDER: Record<AlbumType, number> = {
  person: 0,
  common: 1,
  uncertain: 2,
  eyes_closed: 3,
  blurry: 4,
}

/** Album·ViewerAlbum 공통 부분집합 — 정렬에 필요한 필드만 */
interface SortableAlbum {
  id: ID
  type: AlbumType
  name: string
}

export function sortAlbumsForDisplay<T extends SortableAlbum>(albums: T[]): T[] {
  return albums.slice().sort((a, b) => {
    const byType = TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    if (byType !== 0) return byType
    if (a.type === 'person') {
      // 이름 없는 인물(매퍼 폴백 라벨)은 이름 붙은 인물 뒤 — 이름을 지어주면 가나다 자리로 이동
      const aUnnamed = a.name === UNNAMED_PERSON_LABEL
      const bUnnamed = b.name === UNNAMED_PERSON_LABEL
      if (aUnnamed !== bUnnamed) return aUnnamed ? 1 : -1
      const byName = a.name.localeCompare(b.name, 'ko')
      if (byName !== 0) return byName
    }
    // 동명이인 등 나머지는 불변 키(id)로 고정 — 어떤 갱신에도 상대 순서 유지
    return a.id - b.id
  })
}
