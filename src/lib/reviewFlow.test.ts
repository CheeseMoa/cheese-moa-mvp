import { describe, expect, it } from 'vitest'
import { findNextReviewTarget } from './reviewFlow'
import type { Album, AlbumType, ID } from '../types/api'

interface AlbumOverrides {
  photoCount?: number
  unreviewedPhotoCount?: number | undefined
}

function album(id: ID, type: AlbumType, name: string, overrides: AlbumOverrides = {}): Album {
  return {
    id,
    type,
    personId: type === 'person' ? id : null,
    name,
    photoCount: overrides.photoCount ?? 5,
    unreviewedPhotoCount:
      'unreviewedPhotoCount' in overrides ? overrides.unreviewedPhotoCount : 3,
    coverPhotoId: null,
  }
}

describe('findNextReviewTarget (CHMO-521)', () => {
  it('08 그리드 표시 순서에서 현재 앨범 다음의 미검토 앨범을 고른다', () => {
    const albums = [
      album(1, 'person', '김민준', { unreviewedPhotoCount: 0 }),
      album(2, 'person', '박서연'),
      album(3, 'person', '최지우'),
    ]
    // 정렬 결과 김민준 → 박서연 → 최지우. 박서연에서 완료하면 다음은 최지우
    expect(findNextReviewTarget(albums, 2)?.name).toBe('최지우')
  })

  it('뒤에 없으면 앞쪽으로 돌아 처음부터 찾는다', () => {
    const albums = [
      album(1, 'person', '김민준'),
      album(2, 'person', '박서연', { unreviewedPhotoCount: 0 }),
      album(3, 'person', '최지우', { unreviewedPhotoCount: 0 }),
    ]
    // 최지우(맨 뒤)에서 완료 → 뒤가 없으니 앞으로 돌아 김민준
    expect(findNextReviewTarget(albums, 3)?.name).toBe('김민준')
  })

  it('현재 앨범은 자기 자신을 다시 열지 않는다 — 미검토가 남아 보여도 제외', () => {
    // 검토 직후 목록은 아직 stale(방금 완료한 앨범이 미검토로 남아 있다)
    const albums = [album(1, 'person', '김민준'), album(2, 'person', '박서연')]
    expect(findNextReviewTarget(albums, 1)?.name).toBe('박서연')
    // 다른 후보가 없으면 자기 자신으로 돌아가는 대신 null(= 호출부가 14로 보낸다)
    expect(findNextReviewTarget([albums[0]], 1)).toBeNull()
  })

  it('특수 앨범(분류 어려움·눈감음·흔들림)은 후보가 아니다 — 검토 UI가 없어 무한 루프가 된다', () => {
    const albums = [
      album(1, 'person', '김민준', { unreviewedPhotoCount: 0 }),
      album(2, 'uncertain', '분류가 어려워요'),
      album(3, 'eyes_closed', '눈감은 사진'),
      album(4, 'blurry', '흔들린 사진'),
    ]
    expect(findNextReviewTarget(albums, 1)).toBeNull()
  })

  it('공통 앨범은 후보다 — 검토·발행 대상이 인물·공통이라(CHMO-357)', () => {
    const albums = [
      album(1, 'person', '김민준', { unreviewedPhotoCount: 0 }),
      album(2, 'common', '공통 사진'),
    ]
    expect(findNextReviewTarget(albums, 1)?.name).toBe('공통 사진')
  })

  it('사진 0장 앨범은 건너뛴다 — 잔류하지만(CHMO-418) 검토할 게 없다', () => {
    const albums = [
      album(1, 'person', '김민준', { unreviewedPhotoCount: 0 }),
      album(2, 'person', '박서연', { photoCount: 0, unreviewedPhotoCount: 0 }),
      album(3, 'person', '최지우'),
    ]
    expect(findNextReviewTarget(albums, 1)?.name).toBe('최지우')
  })

  it('unreviewedPhotoCount가 없으면(계약상 optional) 미검토로 단정하지 않는다', () => {
    const albums = [
      album(1, 'person', '김민준', { unreviewedPhotoCount: 0 }),
      album(2, 'person', '박서연', { unreviewedPhotoCount: undefined }),
    ]
    expect(findNextReviewTarget(albums, 1)).toBeNull()
  })

  it('목록에 없는 앨범에서 호출해도(딥링크·삭제됨) 남은 미검토를 찾아 준다', () => {
    const albums = [
      album(1, 'person', '김민준', { unreviewedPhotoCount: 0 }),
      album(2, 'person', '박서연'),
    ]
    expect(findNextReviewTarget(albums, 999)?.name).toBe('박서연')
  })

  it('앨범 목록이 비면 null', () => {
    expect(findNextReviewTarget([], 1)).toBeNull()
  })
})
