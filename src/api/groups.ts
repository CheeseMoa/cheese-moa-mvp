/**
 * 모임 엔드포인트 (CHMO-192) — 02 홈·02-1 참여·03 만들기·05 모임 상세와 초대/공유 시트.
 * BE는 목록을 bare 배열로 주고(GroupSummaryResponse[]), 시크릿(joinKey 등)은
 * 목록에서 의도적으로 노출하지 않는다 — joinKey가 필요하면 GET /groups/:id/invite.
 */
import { apiFetch } from './client'
import {
  toGroup,
  toGroupMember,
  toJoinGroupResult,
  toJoinRequest,
  type RawGroup,
  type RawGroupMember,
  type RawJoinGroupResult,
  type RawJoinRequest,
} from './mappers'
import type {
  Group,
  GroupInviteChannel,
  GroupInviteInfo,
  GroupMember,
  GroupShareInfo,
  ID,
  JoinGroupResult,
  JoinRequest,
} from '../types/api'

/** GET /groups — 내 모임 목록(bare 배열) */
export function listGroups(signal?: AbortSignal): Promise<Group[]> {
  return apiFetch<RawGroup[]>('/groups', { signal }).then((raw) => raw.map(toGroup))
}

/** GET /groups/:id — 모임 상세(BE 응답엔 eventCount 없음 — 화면이 이벤트 목록 길이로 파생) */
export function getGroup(groupId: ID | string, signal?: AbortSignal): Promise<Group> {
  return apiFetch<RawGroup>(`/groups/${groupId}`, { signal }).then(toGroup)
}

/** POST /groups — 모임 생성(학부모 공유 비밀번호는 서버가 자동 발급) */
export function createGroup(input: { name: string; password: string }): Promise<Group> {
  return apiFetch<RawGroup>('/groups', { method: 'POST', body: input }).then(toGroup)
}

/** PATCH /groups/:id — 모임 이름 수정(F2.4 — name만 변경 가능) */
export function renameGroup(groupId: ID | string, name: string): Promise<Group> {
  return apiFetch<RawGroup>(`/groups/${groupId}`, { method: 'PATCH', body: { name } }).then(toGroup)
}

/**
 * DELETE /groups/:id — 모임 삭제(하위 이벤트·앨범·사진 연쇄, 학부모 공유 링크도 무효화).
 * BE는 CHMO-273 진행 중(스웨거 미배포) — 응답 본문은 쓰지 않으므로 봉투 result 형태와 무관.
 */
export function deleteGroup(groupId: ID | string): Promise<void> {
  return apiFetch<unknown>(`/groups/${groupId}`, { method: 'DELETE' }).then(() => undefined)
}

/**
 * POST /groups/join — 참여 코드+비밀번호로 **신청(PENDING) 생성**(학부모 전환 §1 승인제 —
 * 즉시 합류가 아니다). role은 joinKey 종류에서 서버가 파생하고(Q6), 학부모 joinKey일 땐
 * childNames(자녀 이름 자유 텍스트, 1개 이상)가 필수다.
 */
export function joinGroup(input: {
  joinKey: string
  password: string
  childNames?: string[]
}): Promise<JoinGroupResult> {
  return apiFetch<RawJoinGroupResult>('/groups/join', { method: 'POST', body: input }).then(
    toJoinGroupResult,
  )
}

/** BE GroupInviteResponse(초안 §2) — 2종 채널. joinUrl은 응답에 없다(FE가 경로형 파생 — CHMO-237) */
interface RawGroupInvite {
  teacher: { joinKey: string; password: string }
  parent: { joinKey: string; password: string }
}

function toInviteChannel(raw: { joinKey: string; password: string }): GroupInviteChannel {
  // 테스트(node)엔 window가 없다 — 오리진 없이도 경로형 계약은 그대로 검증된다
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return {
    joinKey: raw.joinKey,
    password: raw.password,
    joinUrl: `${origin}/join/${encodeURIComponent(raw.joinKey)}`,
  }
}

/**
 * GET /groups/:id/invite — 초대 정보 2종(TEACHER 전용 — PARENT는 ROLE403, Q3).
 * 학부모 비밀번호는 기존 sharePassword 재사용(Q2). 참여 링크는 BE joinUrl을 신뢰하지 않고
 * joinKey로 **FE 오리진 기준 경로형**(`/join/:joinKey`)을 파생한다(CHMO-237).
 */
export function getInviteInfo(groupId: ID | string, signal?: AbortSignal): Promise<GroupInviteInfo> {
  return apiFetch<RawGroupInvite>(`/groups/${groupId}/invite`, { signal }).then((raw) => ({
    teacher: toInviteChannel(raw.teacher),
    parent: toInviteChannel(raw.parent),
  }))
}

// ── 합류 신청·멤버·인물 매핑 (학부모 전환 §3~4 — TEACHER 전용) ──

/** GET /groups/:id/join-requests?status=PENDING — 대기 신청 목록(bare 배열) */
export function listJoinRequests(
  groupId: ID | string,
  signal?: AbortSignal,
): Promise<JoinRequest[]> {
  return apiFetch<RawJoinRequest[]>(`/groups/${groupId}/join-requests?status=PENDING`, {
    signal,
  }).then((raw) => raw.map(toJoinRequest))
}

/**
 * PATCH /join-requests/:id — 승인/거절. 승인은 **멤버 확정만** 하는 단순 액션이다
 * (인물 연결은 승인 후 별도 — linkPersonParent, 승인·매핑 분리 확정 §1).
 */
export async function resolveJoinRequest(
  joinRequestId: ID | string,
  decision: 'approved' | 'rejected',
): Promise<void> {
  await apiFetch<unknown>(`/join-requests/${joinRequestId}`, {
    method: 'PATCH',
    body: { status: decision.toUpperCase() },
  })
}

/** GET /groups/:id/members — 멤버 목록(초대 관리 데이터 소스, bare 배열) */
export function listGroupMembers(
  groupId: ID | string,
  signal?: AbortSignal,
): Promise<GroupMember[]> {
  return apiFetch<RawGroupMember[]>(`/groups/${groupId}/members`, { signal }).then((raw) =>
    raw.map(toGroupMember),
  )
}

/** POST /groups/:id/person-parents — 학부모↔인물 매핑 생성(다대다 — 다자녀·부모 2인 허용) */
export async function linkPersonParent(
  groupId: ID | string,
  input: { userId: ID; personId: ID },
): Promise<void> {
  await apiFetch<unknown>(`/groups/${groupId}/person-parents`, { method: 'POST', body: input })
}

/** DELETE /groups/:id/person-parents — 매핑 해제(미연결로 회귀 — 새 상태 없음, §7-1) */
export async function unlinkPersonParent(
  groupId: ID | string,
  input: { userId: ID; personId: ID },
): Promise<void> {
  await apiFetch<unknown>(`/groups/${groupId}/person-parents`, { method: 'DELETE', body: input })
}

/** GET /groups/:id/share — 학부모 공유 정보(학부모 전용 비밀번호 평문 포함, 멤버 전용) */
export function getShareInfo(groupId: ID | string, signal?: AbortSignal): Promise<GroupShareInfo> {
  return apiFetch<GroupShareInfo>(`/groups/${groupId}/share`, { signal })
}

/**
 * 초대 링크 재진입 사전 감지(02-1) — 이 joinKey의 모임에 이미 참여했는지.
 * 목록 응답엔 joinKey가 없으므로(시크릿 미노출, CHMO-192) 내 모임마다 초대 정보를 조회해 대조한다.
 * 팬아웃(모임 수만큼 조회)이지만 인당 모임 수가 작아 실무상 문제 없음 — 단일 조회로 대체할
 * resolve 엔드포인트는 BE 후속(CHMO-207)에서 논의.
 *
 * 실패 처리: 조회 실패를 '비멤버'로 단정하지 않는다. 실패한 모임에 대상이 숨어 있을 수 있어
 * 일시 오류로 인한 오판(이미 멤버인데 비번 모달을 다시 띄움)을 막는다. 실패분만 한 번 더 시도하고,
 * 그래도 판정 못 하면 null을 돌려 모달로 폴백한다(참여 자체는 막지 않음).
 */
export async function findMyGroupByJoinKey(
  joinKey: string,
  signal?: AbortSignal,
): Promise<Group | null> {
  const groups = await listGroups(signal)

  // joinKey 2종(선생님/학부모 — Q6) 어느 쪽이든 이 모임의 초대 링크다
  const matches = (invite: GroupInviteInfo) =>
    invite.teacher.joinKey === joinKey || invite.parent.joinKey === joinKey

  // 초대 조회는 TEACHER 전용(Q3) — PARENT 멤버십 모임은 ROLE403으로 실패하지만, 그 모임에
  // '이미 멤버'인 것도 사실이므로 판정 불가(null)로 흘려 모달 폴백(참여 시도 시 서버가 409)한다.
  // 모임별 조회 — 성공하면 매치 여부, 실패(일시 오류·권한 등)하면 null(판정 불가)
  const hits = await Promise.all(
    groups.map((g) => getInviteInfo(g.id, signal).then(matches, () => null)),
  )
  const hit = groups.find((_, i) => hits[i] === true)
  if (hit) return hit

  // 전부 성공했는데 매치가 없으면 확실한 비멤버 → 재시도 없이 null.
  // 실패한 모임이 있으면 그 안에 대상이 있을 수 있어 실패분만 한 번 더 확인한다.
  const unresolved = groups.filter((_, i) => hits[i] === null)
  for (const group of unresolved) {
    if (signal?.aborted) break
    try {
      if (matches(await getInviteInfo(group.id, signal))) return group
    } catch {
      // 재시도도 실패 — 이 모임은 판정 보류. 모달로 폴백한다.
    }
  }
  return null
}
