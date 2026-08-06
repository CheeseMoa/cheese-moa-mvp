/**
 * 모임 핸들러 (docs/api-spec.md §3.2 + 학부모 전환 docs/parent-model-api-draft.md §1~3) —
 * 목록/생성/상세/이름수정/참여(신청)/초대/학부모 공유. 신설 승인·멤버·매핑·학부모 사진은 parents.ts.
 */
import { http } from 'msw'
import {
  agreementCatalogOf,
  createMembership,
  db,
  deleteGroupCascade,
  findGroup,
  GUARDIAN_CHILD_CONSENT_TYPE,
  hasAnalyzingEvent,
  membershipOf,
  membershipsOfUser,
  nextId,
  nowIso,
  recordAgreement,
  type DbGroup,
} from '../db'
import {
  api,
  created,
  errorResponse,
  invalidBody,
  invalidRequest,
  groupNotFound,
  ok,
  optionalString,
  readJson,
  requiredString,
  teacherOnlyError,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import { STALE_VERSION } from './agreements'
import { shareUrlOf, toGroupDetail, toGroupSummary, toJoinGroupResponse } from './serializers'

function randomJoinKey(): string {
  // 실 BE는 대소문자 혼합 12자를 발급하고 대소문자를 구분해 매칭한다(채집 예: Fh1TDIk81EPP — CHMO-285)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = ''
  do {
    key = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (db.groups.some((g) => g.joinKey === key || g.parentJoinKey === key))
  return key
}

function randomSharePassword(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export const groupHandlers = [
  // GET /groups — 내 모임 목록(bare 배열, **PENDING 신청 모임 포함** — 홈 비활성 카드용 §7-2) · 화면 02
  http.get(api('/groups'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const items = membershipsOfUser(user.id)
      .map((membership) => {
        const group = findGroup(membership.groupId)
        return group ? toGroupSummary(group, membership) : null
      })
      .filter((item) => item !== null)
    return ok(items)
  }),

  // POST /groups — 모임 만들기(생성자는 ACTIVE EDITOR로 즉시 확정, 시크릿 4종 자동 발급) · 화면 03
  // groupType은 선택(생략 시 BUSINESS — 기존 FE 호환, BE CHMO-599 AC-2). 참여 비밀번호는
  // 요청으로 받지 않는다(AC-9 — 구 FE가 보내는 password는 무시, 4자리 PIN 자동 발급).
  http.post(api('/groups'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ name?: unknown; groupType?: unknown }>(request)
    const name = requiredString(body?.name)
    if (!name) return invalidRequest('모임 이름을 입력해 주세요.')
    const rawType = optionalString(body?.groupType)
    // enum 밖 값은 거부 — BE는 Jackson enum 역직렬화 400(문구 미채집이라 VALID400 계열로 근사)
    if (rawType !== undefined && rawType !== 'BUSINESS' && rawType !== 'GENERAL')
      return invalidRequest('모임 유형이 올바르지 않습니다.')

    const group: DbGroup = {
      id: nextId('grp'),
      name,
      groupType: rawType === 'GENERAL' ? 'general' : 'business',
      // 참여 비밀번호도 sharePassword와 같은 4자리 PIN 형식(BE generateNumericPin)
      password: randomSharePassword(),
      joinKey: randomJoinKey(),
      parentJoinKey: randomJoinKey(),
      share: { token: `shr_${nextId('tok')}`, password: randomSharePassword() },
      createdAt: nowIso(),
    }
    db.groups.push(group)
    const membership = createMembership({
      userId: user.id,
      groupId: group.id,
      role: 'editor',
      status: 'active',
    })
    return created(toGroupDetail(group, membership))
  }),

  // GET /groups/:id — 모임 상세(ACTIVE 멤버 전용 §7-2) · 화면 05
  // PARENT 응답엔 멤버 관련 필드가 없다(§7-3 — serializer가 role로 분기).
  http.get(api('/groups/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const membership = membershipOf(user.id, group.id)
    if (!membership) return groupNotFound()
    // PENDING 접근 거부(§7-2 deny-by-default) — BE 확정: SPACE403(NOT_SPACE_MEMBER, CHMO-475 AC2).
    // 선생님도 승인제가 되면서 제작자 화면이 이 응답을 받을 수 있다(승인 전 딥링크·새로고침).
    if (membership.status !== 'active')
      return errorResponse(403, 'SPACE403', '아직 승인되지 않은 모임입니다.')
    return ok(toGroupDetail(group, membership))
  }),

  // PATCH /groups/:id — 모임 이름 수정(TEACHER 전용 §6 — name만 허용, 그 외 필드 무시) · 화면 05 ⚙
  http.patch(api('/groups/:id'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied

    const body = await readJson<{ name?: unknown }>(request)
    if (!body) return invalidBody()
    const name = optionalString(body.name)
    if (name === null) return invalidRequest('모임 이름을 입력해 주세요.')
    if (name !== undefined) group.name = name
    return ok(toGroupDetail(group, membershipOf(user.id, group.id)!))
  }),

  // DELETE /groups/:id — 모임 삭제(TEACHER 전용 §6, 하위 이벤트·앨범·사진 연쇄 정리) · 화면 05 ⚙
  // BE CHMO-273 진행 중(스웨거 미배포) — 성공 봉투(result null)로 응답, 배포 후 계약 재확인
  http.delete(api('/groups/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied
    // 분석 중 이벤트가 있으면 거부 — BE DeleteSpaceUseCase 가드(CHMO-564 스펙 대조로 확인, 미채집).
    // 마지막 선생님 나가기(parents.ts)가 이 가드를 우회하지 못하는 것과 한 규칙이다
    if (hasAnalyzingEvent(group.id))
      return errorResponse(
        409,
        'MOMENT409',
        '분석 중인 이벤트는 삭제할 수 없습니다. 분석이 끝난 뒤 다시 시도해 주세요.',
      )
    deleteGroupCascade(group.id)
    return ok(null)
  }),

  // POST /groups/join — 참여 코드+비밀번호로 **신청(PENDING) 생성**(즉시 합류 아님 — §1 승인제) · 화면 02-1
  // role은 joinKey 종류에서 파생(Q6): 선생님 키=모임 비밀번호, 학부모 키=sharePassword(Q2).
  // **키는 "누가 신청할 수 있나"만 정하고 "누가 들어오나"는 승인이 정한다** — 선생님 키도
  // PENDING이다(BE CHMO-475로 실 BE도 동일. 모임 생성자만 예외로 즉시 ACTIVE — POST /groups).
  http.post(api('/groups/join'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{
      joinKey?: unknown
      password?: unknown
      childNames?: unknown
      childConsentVersion?: unknown
    }>(request)
    const joinKey = requiredString(body?.joinKey)
    const password = requiredString(body?.password)
    if (!joinKey || !password) return invalidRequest('참여 코드와 비밀번호를 입력해 주세요.')

    const teacherGroup = db.groups.find((g) => g.joinKey === joinKey)
    const parentGroup = teacherGroup ? undefined : db.groups.find((g) => g.parentJoinKey === joinKey)
    const group = teacherGroup ?? parentGroup
    if (!group) return groupNotFound()
    // GENERAL 모임의 학부모 키는 **없는 키 취급**(SPACE404 — BE CHMO-599 AC-6): 일반 모임엔
    // 학부모 역할 진입로가 없다. 비밀번호 검증보다 앞에 둬 모임의 존재를 드러내지 않는다(ADR 020)
    if (parentGroup && parentGroup.groupType === 'general') return groupNotFound()
    const role = teacherGroup ? 'editor' : 'viewer'

    // BE JOIN403 — 뷰어 잠금 해제(학부모 비밀번호)도 같은 코드를 쓴다
    const expected = role === 'editor' ? group.password : group.share.password
    if (expected !== password) return errorResponse(403, 'JOIN403', '비밀번호가 일치하지 않습니다.')

    // 중복 신청/합류(409)를 childNames 검증(400)보다 먼저 — 뒤에 두면 이미 신청한 학부모의
    // 재시도가 '아이 이름을 입력해 주세요'로 응답돼 자신이 신청 중이라는 사실을 알 수 없다.
    // BE 코드 미확인 — 이미 멤버/신청 중 409는 채집되지 않았다
    const existing = membershipOf(user.id, group.id)
    if (existing)
      return errorResponse(
        409,
        'ALREADY_MEMBER',
        existing.status === 'active' ? '이미 참여 중인 모임입니다.' : '이미 참여 신청한 모임입니다.',
      )

    // 학부모 신청은 자녀 이름(자유 텍스트) 필수 — 신청 UI에 인물 목록을 노출하지 않는다(§2)
    let childNames: string[] = []
    if (role === 'viewer') {
      const raw = Array.isArray(body?.childNames) ? body.childNames : []
      childNames = raw.map(requiredString).filter((name): name is string => name !== null)
      // 자녀 이름 검증이 동의 검증보다 앞 — 1/3 프로브(이름·동의 없는 제출)가 이 400으로
      // 학부모 코드를 감지하는 흐름 유지. BE 검증 순서·문구는 미채집(CHMO-586 배포 전)
      if (childNames.length === 0) return invalidRequest('아이 이름을 입력해 주세요.')

      // 자녀 정보 처리 동의(BE CHMO-586) — 동의권자(보호자) 본인의 기록이라 신청 필수.
      // 누락·구버전이면 신청째 거부(VALID400 — 티켓 확정, 문구는 BE 미채집이라 추정)
      const consentVersion = requiredString(body?.childConsentVersion)
      if (!consentVersion) return invalidRequest('자녀 정보 처리 동의는 필수입니다.')
      const consentCatalog = agreementCatalogOf(GUARDIAN_CHILD_CONSENT_TYPE)
      if (consentVersion !== consentCatalog?.currentVersion) return invalidRequest(STALE_VERSION)

      // 기록은 신청 시(승인 전 — 동의 의사표시 시각이 기준·append-only라 거절돼도 남는다).
      // 같은 모임 재신청(거절 후)이 같은 상태면 행을 늘리지 않는다(멱등 — BE AC)
      const already = db.agreements.some(
        (row) =>
          row.userId === user.id &&
          row.type === GUARDIAN_CHILD_CONSENT_TYPE &&
          row.groupId === group.id &&
          row.version === consentVersion &&
          row.agreed,
      )
      if (!already)
        recordAgreement({
          userId: user.id,
          type: GUARDIAN_CHILD_CONSENT_TYPE,
          version: consentVersion,
          agreed: true,
          groupId: group.id,
        })
    }

    const membership = createMembership({
      userId: user.id,
      groupId: group.id,
      role,
      status: 'pending',
      childNames,
    })
    return created(toJoinGroupResponse(group, membership))
  }),

  // GET /groups/:id/invite — 초대 정보 2종(TEACHER 전용 — PARENT는 ROLE403, Q3) · 화면 05-2
  // 학부모 채널 비밀번호는 기존 sharePassword 재사용(Q2). joinUrl은 주지 않는다(FE가 경로형 파생 — CHMO-237).
  http.get(api('/groups/:id/invite'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied
    return ok({
      teacher: { joinKey: group.joinKey, password: group.password },
      parent: { joinKey: group.parentJoinKey, password: group.share.password },
    })
  }),

  // GET /groups/:id/share — 학부모 공유 정보(무로그인 뷰어 — 폐기 예정 §7, 이관 완료까지 유지) · 화면 05
  // 초대 정보의 일종이라 TEACHER 전용으로 강화(§6).
  http.get(api('/groups/:id/share'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied
    return ok({
      token: group.share.token,
      url: shareUrlOf(group),
      password: group.share.password,
      hasPassword: true,
    })
  }),
]
