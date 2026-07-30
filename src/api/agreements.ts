/**
 * 약관 동의 엔드포인트 (CHMO-516 · BE CHMO-514).
 *
 * 동의는 "동의했다"가 아니라 **누가·언제·어느 버전에 동의했다**를 남기는 기록이라
 * 서버 이력이 append-only다(재동의·철회도 새 행). FE가 할 일은 **화면에 보여준 버전을 그대로
 * 제출**하는 것 하나다 — 버전이 증빙의 핵심이라 서버가 현재 버전과 대조해 구버전 제출을 막는다.
 *
 * 항목은 두 축으로 갈린다:
 * - `scope: 'user'` — 계정 1회(가입 동의 4종 + 선택 마케팅). 수집 화면은 CHMO-479
 * - `scope: 'group'` — 모임마다(아동 보호자 동의 확보 확인). 업로드 presign이 이걸 요구한다
 *
 * ⚠ 버전의 원천은 **지금은 서버**다(`currentVersion`을 되돌려준다). FE 문구가 버전을 소유하도록
 * 바꾸는 건 CHMO-517 — 그때 `attestGuardianConsent`도 서버 조회 없이 FE 상수를 싣는다.
 */
import { ApiRequestError, apiFetch } from './client'
import { toAgreementStatus, type RawAgreementStatus } from './mappers'
import type { AgreementStatus, AgreementSubmission, AgreementType, ID } from '../types/api'

/** BE AgreementStatusResponse — 목록이 bare 배열이 아니라 `agreements` 키에 담겨 온다 */
interface RawAgreementStatusResponse {
  agreements?: RawAgreementStatus[]
}

/** GET /agreements — 항목별 현재 버전·필수 여부·스코프 + 내 동의 상태 */
export function listAgreements(signal?: AbortSignal): Promise<AgreementStatus[]> {
  return apiFetch<RawAgreementStatusResponse>('/agreements', { signal }).then((raw) =>
    (raw.agreements ?? []).map(toAgreementStatus),
  )
}

/**
 * POST /agreements — 회원(user 스코프) 동의 제출. 응답은 제출 후 상태(GET과 같은 형태).
 * 전 항목을 보낼 필요는 없다(선택 항목 단독 철회도 이 경로 — `agreed: false`가 거부 기록이다).
 * 모임 스코프 항목을 여기로 보내면 서버가 거절한다(VALID400) — 그건 attestGuardianConsent다.
 */
export function submitAgreements(items: AgreementSubmission[]): Promise<AgreementStatus[]> {
  return apiFetch<RawAgreementStatusResponse>('/agreements', {
    method: 'POST',
    body: {
      agreements: items.map((item) => ({
        type: item.type.toUpperCase(),
        version: item.version,
        agreed: item.agreed,
      })),
    },
  }).then((raw) => (raw.agreements ?? []).map(toAgreementStatus))
}

/** 항목의 현재 유효 버전 — 없으면(미배포·항목 삭제) 제출할 버전을 모르므로 실패로 다룬다 */
export async function currentAgreementVersion(
  type: AgreementType,
  signal?: AbortSignal,
): Promise<string> {
  const found = (await listAgreements(signal)).find((item) => item.type === type)
  if (!found)
    throw new ApiRequestError(
      502,
      'AGREEMENT_VERSION_MISSING',
      '약관 정보를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
  return found.currentVersion
}

/**
 * POST /groups/:id/agreements — 아동 보호자 동의 확보 확인(선생님 전용·멱등).
 * 확인은 **선생님별·모임별**로 쌓인다(다른 선생님의 확인으로 갈음되지 않는다) — 그래서 초대로
 * 합류한 선생님은 첫 업로드에서 자기 확인을 남긴다.
 * 화면은 버전을 모른다: 현재 버전을 확인한 뒤 그 버전으로 기록한다(안내 문서가 개정돼 버전이
 * 오르면 다시 확인 대상이 되는 것도 이 조회 덕이다).
 * 철회는 없다 — 이미 올라간 사진의 근거를 없애는 행위라 사진 삭제로 처리한다(BE 계약).
 */
export async function attestGuardianConsent(
  groupId: ID | string,
  signal?: AbortSignal,
): Promise<void> {
  const version = await currentAgreementVersion('child_consent_attested', signal)
  await apiFetch<unknown>(`/groups/${groupId}/agreements`, {
    method: 'POST',
    body: { version },
    signal,
  })
}
