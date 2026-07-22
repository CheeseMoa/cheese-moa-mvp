import { describe, expect, it } from 'vitest'
import { sortAlbumsForDisplay } from './albumSort'
import { UNNAMED_PERSON_LABEL } from './albumLabels'
import type { AlbumType, ID } from '../types/api'

function album(id: ID, type: AlbumType, name: string) {
  return { id, type, name }
}

describe('sortAlbumsForDisplay (CHMO-411)', () => {
  it('타입 순서: 인물 → 공통 → 분류가 어려워요 → 눈감음 → 흔들림', () => {
    const sorted = sortAlbumsForDisplay([
      album(1, 'blurry', '흔들린 사진'),
      album(2, 'uncertain', '분류가 어려워요'),
      album(3, 'common', '공통'),
      album(4, 'eyes_closed', '눈감은 사진'),
      album(5, 'person', '김민준'),
    ])
    expect(sorted.map((a) => a.type)).toEqual([
      'person',
      'common',
      'uncertain',
      'eyes_closed',
      'blurry',
    ])
  })

  it('인물은 이름 가나다순, 이름 없음은 인물 그룹 맨 뒤', () => {
    const sorted = sortAlbumsForDisplay([
      album(1, 'person', UNNAMED_PERSON_LABEL),
      album(2, 'person', '최지우'),
      album(3, 'common', '공통'),
      album(4, 'person', '김민준'),
      album(5, 'person', '박서연'),
    ])
    expect(sorted.map((a) => a.name)).toEqual([
      '김민준',
      '박서연',
      '최지우',
      UNNAMED_PERSON_LABEL,
      '공통',
    ])
  })

  it('같은 이름(동명이인)·이름 없음끼리는 id로 고정 — 입력 순서와 무관', () => {
    const sorted = sortAlbumsForDisplay([
      album(12, 'person', UNNAMED_PERSON_LABEL),
      album(7, 'person', '김민준'),
      album(11, 'person', UNNAMED_PERSON_LABEL),
      album(3, 'person', '김민준'),
    ])
    expect(sorted.map((a) => a.id)).toEqual([3, 7, 11, 12])
  })

  it('서버가 미검토 우선(CHMO-336)으로 섞어 보내도 표시 순서는 동일하다', () => {
    // 실 BE 응답 순서 시뮬레이션: 미검토(공통·이도윤) 먼저, 검토 완료(김민준) 뒤
    const beOrder = [
      album(2, 'common', '공통'),
      album(3, 'person', '이도윤'),
      album(1, 'person', '김민준'),
    ]
    const typeOrder = [
      album(1, 'person', '김민준'),
      album(3, 'person', '이도윤'),
      album(2, 'common', '공통'),
    ]
    expect(sortAlbumsForDisplay(beOrder)).toEqual(sortAlbumsForDisplay(typeOrder))
  })

  it('입력 배열을 변형하지 않는다', () => {
    const input = [album(2, 'common', '공통'), album(1, 'person', '김민준')]
    sortAlbumsForDisplay(input)
    expect(input.map((a) => a.id)).toEqual([2, 1])
  })
})
