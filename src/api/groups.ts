/**
 * 모임 엔드포인트 (CHMO-192) — 02 홈·02-1 참여·03 만들기·05 모임 상세와 초대/공유 시트.
 * BE는 목록을 bare 배열로 주고(GroupSummaryResponse[]), 시크릿(joinKey 등)은
 * 목록에서 의도적으로 노출하지 않는다 — joinKey가 필요하면 GET /groups/:id/invite.
 */
import { apiFetch } from './client'
import { toGroup, type RawGroup } from './mappers'
import type { Group, GroupInviteInfo, GroupShareInfo, ID } from '../types/api'

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

/** POST /groups/join — 참여 코드+모임 비밀번호로 합류 */
export function joinGroup(input: { joinKey: string; password: string }): Promise<Group> {
  return apiFetch<RawGroup>('/groups/join', { method: 'POST', body: input }).then(toGroup)
}

/** GET /groups/:id/invite — 선생님 초대 정보(모임 비밀번호 평문 포함, 멤버 전용) */
export function getInviteInfo(groupId: ID | string, signal?: AbortSignal): Promise<GroupInviteInfo> {
  return apiFetch<GroupInviteInfo>(`/groups/${groupId}/invite`, { signal })
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

  // 모임별 joinKey 조회 — 성공하면 joinKey 문자열, 실패(일시 오류 등)하면 null(판정 불가)
  const keys = await Promise.all(
    groups.map((g) => getInviteInfo(g.id, signal).then((invite) => invite.joinKey, () => null)),
  )
  const hit = groups.find((_, i) => keys[i] === joinKey)
  if (hit) return hit

  // 전부 성공했는데 매치가 없으면 확실한 비멤버 → 재시도 없이 null.
  // 실패한 모임이 있으면 그 안에 대상이 있을 수 있어 실패분만 한 번 더 확인한다.
  const unresolved = groups.filter((_, i) => keys[i] === null)
  for (const group of unresolved) {
    if (signal?.aborted) break
    try {
      const invite = await getInviteInfo(group.id, signal)
      if (invite.joinKey === joinKey) return group
    } catch {
      // 재시도도 실패 — 이 모임은 판정 보류. 모달로 폴백한다.
    }
  }
  return null
}
