import type { AlbumType } from '../types/api'

/**
 * 특수 앨범(비인물) 고정 표시명 — UI·목 공유 단일 원천(lib/pin.ts 선례).
 * BE AlbumSummaryResponse는 personName만 주고 특수 앨범은 null이라(CHMO-192)
 * 표시명은 FE가 type에서 파생한다. 목(mocks/db.ts)도 같은 라벨을 쓴다.
 */
export const SPECIAL_ALBUM_LABELS: Record<Exclude<AlbumType, 'person'>, string> = {
  common: '공통',
  uncertain: '분류가 어려워요',
  eyes_closed: '눈감은 사진',
  blurry: '흔들린 사진',
}

/** 인물 앨범인데 이름이 비어 있을 때(시드 결손 등) 폴백 */
export const UNNAMED_PERSON_LABEL = '이름 없음'
