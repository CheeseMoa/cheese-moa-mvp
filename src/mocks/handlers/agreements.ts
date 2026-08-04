/**
 * 약관 동의 핸들러 (BE CHMO-514 PR #154 계약 — CheeseMoa-BE `docs/spec/CHMO-514-약관-동의-기록.md`).
 *
 * 기록은 append-only다: 재동의도 철회도 새 행이고 기존 행을 고치지 않는다. 멱등은
 * "최신 행이 같은 상태면 저장하지 않음"으로 앱 계층(=이 핸들러)이 맡는다(DB unique 제약 없음).
 *
 * 검증 순서·문구는 BE `SubmitAgreementsUseCase.validate`와 같게 맞췄다 —
 * 스코프 → 버전 → 필수. 버전 불일치·필수 미동의는 FE 구현 오류 상황이라 전용 코드 없이 VALID400.
 */
import { http } from 'msw'
import {
  agreementCatalogOf,
  findGroup,
  guardianConsentAttested,
  latestUserAgreementOf,
  recordAgreement,
  GUARDIAN_CONSENT_TYPE,
} from '../db'
import {
  api,
  groupNotFound,
  invalidBody,
  invalidRequest,
  ok,
  readJson,
  requiredString,
  teacherOnlyError,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import { toAgreementStatusResponse } from './serializers'
import type { AgreementType } from '../../types/api'

/** BE `AgreementType.requireCurrentVersion` 문구 — 구버전 문구를 보여준 FE를 막는다.
 * 합류 신청의 자녀 동의 버전 검증(groups.ts — CHMO-586)도 같은 문구를 쓴다 */
export const STALE_VERSION = '약관 버전이 최신이 아닙니다. 최신 약관을 확인해 주세요.'

/** 요청 본문의 대문자 enum → 카탈로그 항목(미지 값이면 null → 400) */
function agreementTypeOf(value: unknown) {
  if (typeof value !== 'string') return null
  return agreementCatalogOf(value.toLowerCase() as AgreementType) ?? null
}

export const agreementHandlers = [
  // GET /agreements — 항목별 현재 버전·필수 여부·스코프 + 내 동의 상태 · 화면 CHMO-479·06-U
  http.get(api('/agreements'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    return ok(toAgreementStatusResponse(user.id))
  }),

  // POST /agreements — 회원(USER 스코프) 동의 제출. 응답은 제출 후 상태(GET과 같은 형태)
  http.post(api('/agreements'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ agreements?: unknown }>(request)
    if (!body) return invalidBody()
    const items = body.agreements
    if (!Array.isArray(items) || items.length === 0)
      return invalidRequest('동의 항목은 비어 있을 수 없습니다.')

    // 한 항목이라도 거절되면 아무것도 기록하지 않는다(BE는 @Transactional로 롤백) —
    // 검증을 먼저 다 돌고 저장은 그 뒤에
    const submissions: { type: AgreementType; agreed: boolean }[] = []
    for (const item of items as { type?: unknown; version?: unknown; agreed?: unknown }[]) {
      const catalog = agreementTypeOf(item?.type)
      if (!catalog) return invalidRequest('동의 항목은 필수입니다.')
      const version = requiredString(item?.version)
      if (!version) return invalidRequest('약관 버전은 필수입니다.')
      // 래퍼 타입 + NotNull(BE) — 필드 누락이 조용히 미동의로 해석되지 않게
      if (typeof item?.agreed !== 'boolean') return invalidRequest('동의 여부는 필수입니다.')

      if (catalog.scope !== 'user')
        return invalidRequest('모임 단위 동의 항목은 이 경로로 제출할 수 없습니다.')
      if (version !== catalog.currentVersion) return invalidRequest(STALE_VERSION)
      if (catalog.required && !item.agreed) return invalidRequest('필수 동의 항목은 동의해야 합니다.')
      submissions.push({ type: catalog.type, agreed: item.agreed })
    }

    for (const submission of submissions) {
      const catalog = agreementCatalogOf(submission.type)
      if (!catalog) continue
      const latest = latestUserAgreementOf(user.id, submission.type)
      // 같은 버전으로 같은 상태를 이미 기록했으면 행을 늘리지 않는다(중복 제출·재시도 대비).
      // 상태가 다르면(동의 → 철회) 새 행을 남긴다 — 그게 이력이다
      if (latest && latest.agreed === submission.agreed && latest.version === catalog.currentVersion)
        continue
      recordAgreement({
        userId: user.id,
        type: submission.type,
        version: catalog.currentVersion,
        agreed: submission.agreed,
      })
    }
    return ok(toAgreementStatusResponse(user.id))
  }),

  // POST /groups/:id/agreements — 아동 보호자 동의 확보 확인(TEACHER 전용·멱등) · 화면 03·06-U
  // 항목은 받지 않는다 — 모임 스코프 항목이 하나뿐이라 값이 하나뿐인 필드는 죽은 유연성이다.
  http.post(api('/groups/:id/agreements'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    // BE는 findTeacherSpace를 쓴다 — 학부모는 ROLE403. 비멤버·승인 전은 목의 기존 은닉 관문을
    // 그대로 따른다(BE 스펙 표는 SPACE403 — 승인제 CHMO-475 이후 실 BE 응답 확인은 CHMO-449)
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied

    const body = await readJson<{ version?: unknown }>(request)
    if (!body) return invalidBody()
    const version = requiredString(body.version)
    if (!version) return invalidRequest('약관 버전은 필수입니다.')
    const catalog = agreementCatalogOf(GUARDIAN_CONSENT_TYPE)
    if (version !== catalog?.currentVersion) return invalidRequest(STALE_VERSION)

    // 멱등 — 같은 모임을 두 번 확인해도 행이 늘지 않는다. 확인은 agreed=true로만 기록된다
    // (철회는 정의하지 않는다 — 이미 올라간 사진의 근거를 없애는 행위라 사진 삭제로 처리)
    if (!guardianConsentAttested(user.id, group.id))
      recordAgreement({
        userId: user.id,
        type: GUARDIAN_CONSENT_TYPE,
        version: catalog.currentVersion,
        agreed: true,
        groupId: group.id,
      })
    return ok(null)
  }),
]
