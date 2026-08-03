import { describe, expect, it } from 'vitest'
import { isLastActiveTeacher } from './lastTeacher'
import type { GroupMember, GroupRole } from '../types/api'

const member = (userId: number, role: GroupRole): GroupMember => ({
  userId,
  nickname: `사용자${userId}`,
  role,
  childNames: [],
  mappings: [],
})

/**
 * 판별이 곧 경고 문구를 정한다(CHMO-571) — true면 "모임이 삭제됩니다" 경고 모달,
 * false면 기존 나가기 확인. 오판의 비용이 비대칭이다: false여야 할 때 true면 거짓 경고,
 * true여야 할 때 false면 **무경고 모임 삭제**(BE CHMO-564 승격)라 경계 사례를 고정한다.
 */
describe('isLastActiveTeacher', () => {
  it('선생님이 나 혼자면 마지막 선생님이다 — 학부모 수는 무관', () => {
    expect(isLastActiveTeacher([member(1, 'teacher')], 1)).toBe(true)
    expect(
      isLastActiveTeacher([member(1, 'teacher'), member(2, 'parent'), member(3, 'parent')], 1),
    ).toBe(true)
  })

  it('다른 선생님이 남으면 내 나가기는 모임을 지우지 않는다', () => {
    expect(isLastActiveTeacher([member(1, 'teacher'), member(2, 'teacher')], 1)).toBe(false)
  })

  it('유일한 선생님이 내가 아니면 false — 내가 학부모로 있는 모임', () => {
    expect(isLastActiveTeacher([member(1, 'teacher'), member(2, 'parent')], 2)).toBe(false)
  })

  it('선생님 0명·빈 목록·내가 목록에 없음은 전부 false — 목록은 ACTIVE 전용이라 내가 ACTIVE 선생님이면 반드시 목록에 있다', () => {
    expect(isLastActiveTeacher([], 1)).toBe(false)
    expect(isLastActiveTeacher([member(2, 'parent')], 1)).toBe(false)
    expect(isLastActiveTeacher([member(2, 'teacher')], 1)).toBe(false)
  })
})
