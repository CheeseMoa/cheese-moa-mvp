import type { GroupMember, ID } from '../types/api'

/**
 * "내가 이 모임의 마지막 ACTIVE 선생님인가" — 나가기 확인 모달 분기(CHMO-571)의 단일 원천.
 * BE CHMO-564가 마지막 선생님의 나가기를 거부(MEMBER409) 대신 **모임 전체 삭제로 승격**하면서,
 * 파괴적 결과의 확인 책임이 FE 모달로 넘어왔다. BE는 별도 필드를 주지 않아 FE 파생값이다
 * (BE 스펙 확정): `GET /groups/:id/members`는 ACTIVE 멤버만 반환하므로 role=teacher가
 * 1명이고 그 1명이 나면 마지막 선생님이다.
 *
 * 선생님이 0명인 목록이나 내가 목록에 없는 경우 false가 **안전이 아니라 정답**이다 —
 * 목록은 ACTIVE 전용이라 내가 ACTIVE 선생님이면 반드시 목록에 있고, 내가 없거나 다른
 * 선생님이 남으면 내 나가기는 모임을 지우지 않는다.
 */
export function isLastActiveTeacher(members: GroupMember[], myUserId: ID): boolean {
  const teachers = members.filter((m) => m.role === 'teacher')
  return teachers.length === 1 && teachers[0].userId === myUserId
}
