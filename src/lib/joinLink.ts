/**
 * 초대 링크 FE 계약 단일 원천 (CHMO-607) — 생성(GroupInviteLinks)과 해석(JoinPage)이 같은
 * 마커 이름·형식을 쓴다. joinKey는 불투명 값이고 joinKey→모임 정보 조회 API가 실 BE에 없어
 * (SpaceController 실확인 — join/invite/share뿐), 합류 화면이 신청 전에 보여줄 정보(유형·
 * 모임명·멤버/이벤트 수)는 전부 링크 쿼리에 동봉한다(2026-08-06 사용자 확정). 링크는 FE가
 * 만들므로(CHMO-237 경로형 파생) BE 변경이 없고, 값은 **공유 시점 스냅샷**이다 — 이름 변경·
 * 인원 변동은 다음 공유 전까지 반영되지 않는다.
 *
 * 마커: `type`(general|business) · `role`(viewer — 멤버/학부모 키. editor 키는 생략이 기본) ·
 * `name`(모임명) · `members`/`events`(수). 구 마커 `role=parent`(CHMO-445)는 viewer로 흡수한다.
 */
import type { GroupRole, GroupType } from '../types/api'

export interface JoinLinkInfo {
  groupType?: GroupType
  /** 링크가 초대하는 역할 — viewer 키만 마커를 싣는다(생략 = editor 키 또는 구형 링크) */
  role?: GroupRole
  groupName?: string
  memberCount?: number
  eventCount?: number
}

/** 0 이상 정수만 마커로 싣고 읽는다 — 링크는 외부 입력이라 이상값은 없는 것으로 취급 */
function asCount(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined
  return Number(value)
}

/** 경로형 참여 링크(`/join/:joinKey?…`) — 알고 있는 정보만 동봉한다(없는 마커는 생략) */
export function buildJoinPath(joinKey: string, info: JoinLinkInfo = {}): string {
  const params = new URLSearchParams()
  if (info.groupType) params.set('type', info.groupType)
  if (info.role === 'viewer') params.set('role', 'viewer')
  if (info.groupName) params.set('name', info.groupName)
  if (info.memberCount !== undefined) params.set('members', String(info.memberCount))
  if (info.eventCount !== undefined) params.set('events', String(info.eventCount))
  const query = params.toString()
  return `/join/${encodeURIComponent(joinKey)}${query ? `?${query}` : ''}`
}

export function buildJoinUrl(origin: string, joinKey: string, info: JoinLinkInfo = {}): string {
  return `${origin}${buildJoinPath(joinKey, info)}`
}

export function parseJoinLinkInfo(params: URLSearchParams): JoinLinkInfo {
  const rawType = params.get('type')
  const rawRole = params.get('role')
  // 구 마커 role=parent — 학부모(viewer) 키 링크였다. 저장된 링크는 없지만(미배포) 해석은 남긴다
  const role: GroupRole | undefined =
    rawRole === 'viewer' || rawRole === 'parent' ? 'viewer' : undefined
  const groupType: GroupType | undefined =
    rawType === 'general' || rawType === 'business'
      ? rawType
      : // viewer 키는 비즈니스 모임에만 있다(GENERAL 학부모 키 합류는 SPACE404 — BE CHMO-599 AC-6)
        role === 'viewer'
        ? 'business'
        : undefined
  const name = params.get('name')?.trim()
  return {
    groupType,
    role,
    groupName: name ? name : undefined,
    memberCount: asCount(params.get('members')),
    eventCount: asCount(params.get('events')),
  }
}
