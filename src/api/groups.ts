/**
 * 모임 엔드포인트 (CHMO-192) — 02 홈·02-1 참여·03 만들기·05 모임 상세와 초대/공유 시트.
 * BE는 목록을 bare 배열로 주고(GroupSummaryResponse[]), 시크릿(joinKey 등)은
 * 목록에서 의도적으로 노출하지 않는다 — joinKey가 필요하면 GET /groups/:id/invite.
 */
import { ApiRequestError, apiFetch } from './client'
import { listEventAlbums, listGroupEvents } from './events'
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
import { sortAlbumsForDisplay } from '../lib/albumSort'
import type {
  Group,
  GroupInviteChannel,
  GroupInviteInfo,
  GroupMember,
  GroupPerson,
  GroupRole,
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
 * childNames(자녀 이름 자유 텍스트, 1개 이상)와 childConsentVersion(자녀 정보 처리 동의 —
 * BE CHMO-586)이 필수다. 누락·구버전은 VALID400으로 신청 자체가 거부된다.
 */
export function joinGroup(input: {
  joinKey: string
  password: string
  childNames?: string[]
  /**
   * 자녀의 사진·얼굴 특징정보 처리 동의 버전(학부모 키 경로 필수 — CHMO-587). `GET /agreements`
   * `GUARDIAN_CHILD_CONSENT` 항목의 currentVersion을 그대로 싣는다(하드코딩 금지 — 문서 개정으로
   * 버전이 오르면 자동으로 새 버전이 전송되게). 카탈로그에 항목이 없는 구계약 BE엔 보내지 않는다.
   */
  childConsentVersion?: string
}): Promise<JoinGroupResult> {
  return apiFetch<RawJoinGroupResult>('/groups/join', { method: 'POST', body: input }).then(
    toJoinGroupResult,
  )
}

/**
 * BE GroupInviteResponse(초안 §2 — 2종 채널) ∪ 구계약(평면 — 현재 배포된 실 BE).
 * joinUrl은 신형 응답에 없다(FE가 경로형 파생 — CHMO-237); 구계약의 쿼리형 joinUrl은 버린다.
 */
interface RawGroupInvite {
  teacher?: { joinKey: string; password: string }
  parent?: { joinKey: string; password: string }
  /** 구계약 평면 필드(2026-07-16 채집) — 선생님 채널만 존재하던 시절 */
  joinKey?: string
  password?: string
}

function toInviteChannel(
  raw: { joinKey: string; password: string },
  role: GroupRole = 'teacher',
): GroupInviteChannel {
  // 테스트(node)엔 window가 없다 — 오리진 없이도 경로형 계약은 그대로 검증된다
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  // 학부모 링크엔 role 마커를 싣는다 — joinKey는 불투명(대소문자 12자)이라 02-1 모달/02-2
  // 3단계 분기의 유일한 근거가 URL이다(CHMO-445 — 시트 소비는 CHMO-446)
  const marker = role === 'parent' ? '?role=parent' : ''
  return {
    joinKey: raw.joinKey,
    password: raw.password,
    joinUrl: `${origin}/join/${encodeURIComponent(raw.joinKey)}${marker}`,
  }
}

/**
 * GET /groups/:id/invite — 초대 정보 2종(TEACHER 전용 — PARENT는 ROLE403, Q3).
 * 학부모 비밀번호는 기존 sharePassword 재사용(Q2). 참여 링크는 BE joinUrl을 신뢰하지 않고
 * joinKey로 **FE 오리진 기준 경로형**(`/join/:joinKey`)을 파생한다(CHMO-237).
 *
 * **구계약 공존**(listGroups의 myMembership 흡수와 같은 결): 현재 배포된 실 BE는 평면
 * `{joinKey, password, joinUrl}`(선생님 채널만)을 준다 — teacher로 흡수하고 parent는 null
 * (화면이 학부모 초대 UI를 숨긴다). BE가 초안을 배포하면 폴백을 걷는다.
 */
export function getInviteInfo(groupId: ID | string, signal?: AbortSignal): Promise<GroupInviteInfo> {
  return apiFetch<RawGroupInvite>(`/groups/${groupId}/invite`, { signal }).then((raw) => {
    if (raw.teacher) {
      return {
        teacher: toInviteChannel(raw.teacher),
        parent: raw.parent ? toInviteChannel(raw.parent, 'parent') : null,
      }
    }
    return {
      teacher: toInviteChannel({ joinKey: raw.joinKey ?? '', password: raw.password ?? '' }),
      parent: null,
    }
  })
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

/**
 * DELETE /groups/:id/members/:userId — 멤버 내보내기·나가기(BE CHMO-525·564 · 화면 20·05).
 * 대상이 자신이면 나가기(role 무관 — PENDING이면 신청 취소), 타인이면 TEACHER 전용 내보내기
 * (App Store 1.2 차단 수단, CHMO-526). 보통은 멤버십·신청 이름·인물 매핑만 지워지고
 * 사진·앨범·인물은 모임에 남는다(모임 자산). 이미 없는 대상은 멱등 성공.
 *
 * 단, **자신이 마지막 ACTIVE 선생님이면 나가기가 모임 삭제로 승격된다**(BE CHMO-564 —
 * 이벤트·앨범·사진·전체 멤버십까지. 응답 계약은 그대로 200이라 파괴적 결과의 확인 책임은
 * 호출 화면의 모달이 진다, CHMO-571 — 판별은 isLastActiveTeacher). 에러 2건:
 * 마지막 선생님 나가기에 분석 중 이벤트가 있으면 MOMENT409(모임 삭제와 같은 가드),
 * 내보내기로 선생님이 0명이 되면 MEMBER409(동시 나가기 경쟁에서만 성립).
 */
export async function removeGroupMember(groupId: ID | string, userId: ID): Promise<void> {
  await apiFetch<unknown>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
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

/**
 * 모임 인물 목록(20-1 아이 연결 후보) — 그룹 단위 인물 엔드포인트가 계약 초안에 없어
 * 이벤트별 앨범 목록에서 파생한다: 인물 앨범을 personId로 합치고 사진 수는 전 이벤트 합산.
 * 이름은 모임 단위 전파(CHMO-115)라 어느 이벤트에서 읽어도 같다.
 * 팬아웃(이벤트 수만큼 조회)이지만 모임당 이벤트 수가 작아 실무상 문제 없음 —
 * findMyGroupByJoinKey와 같은 결. 전용 엔드포인트는 BE 후속 논의.
 */
export async function listGroupPersons(
  groupId: ID | string,
  signal?: AbortSignal,
): Promise<GroupPerson[]> {
  const events = await listGroupEvents(groupId, signal)
  const albumLists = await Promise.all(events.map((e) => listEventAlbums(e.id, signal)))
  const byPerson = new Map<ID, GroupPerson>()
  for (const albums of albumLists) {
    for (const album of albums) {
      if (album.type !== 'person' || album.personId === null) continue
      const prev = byPerson.get(album.personId)
      if (prev) {
        prev.photoCount += album.photoCount
        prev.coverThumbnailUrl ??= album.coverThumbnailUrl ?? null
      } else {
        byPerson.set(album.personId, {
          personId: album.personId,
          name: album.name,
          photoCount: album.photoCount,
          coverThumbnailUrl: album.coverThumbnailUrl ?? null,
        })
      }
    }
  }
  // 표시 순서는 앨범 정렬 규칙 재사용(이름 가나다 · '이름 없음' 뒤 — CHMO-411)
  const order = sortAlbumsForDisplay(
    [...byPerson.values()].map((p) => ({ id: p.personId, type: 'person' as const, name: p.name })),
  )
  return order.flatMap((o) => byPerson.get(o.id) ?? [])
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
    invite.teacher.joinKey === joinKey || invite.parent?.joinKey === joinKey

  // 초대 조회는 TEACHER 전용(Q3) — 학부모 멤버십 모임(ROLE403)·대기 신청 모임(404 은닉)은
  // 재시도해도 항상 같은 답이라 **결정적 실패(false)** 로 분류해 재시도에서 뺀다.
  // 판정 못 한 모임이 남으면 모달 폴백(참여 시도 시 서버가 409로 안내)이므로 안전 방향이다.
  const deterministicFailure = (e: unknown) =>
    e instanceof ApiRequestError && (e.code === 'FORBIDDEN_ROLE' || e.code === 'NOT_FOUND')

  // 모임별 조회 — 성공하면 매치 여부, 일시 오류(서버 5xx·네트워크)면 null(판정 불가)
  const hits = await Promise.all(
    groups.map((g) =>
      getInviteInfo(g.id, signal).then(matches, (e) => (deterministicFailure(e) ? false : null)),
    ),
  )
  const hit = groups.find((_, i) => hits[i] === true)
  if (hit) return hit

  // 매치가 없으면: 일시 오류로 판정 못 한 모임만 한 번 더 확인한다 — 실패를 '비멤버'로
  // 단정하면 이미 멤버인데 비번 모달을 다시 띄우는 오판이 난다.
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
