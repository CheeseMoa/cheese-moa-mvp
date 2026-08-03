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
 * 버전의 원천은 **FE 문구다**(CHMO-517) — 서버 `currentVersion`을 에코하지 않고 화면에 실제로
 * 보여준 문서·문장의 버전(`src/legal/*`)을 싣는다. 서버 버전과 어긋나면(배포 시차) BE가
 * VALID400으로 거부하고, 가입 동의 화면은 제출 전에 새로고침 안내로 빠진다(lib/consentGate).
 */
import { apiFetch } from './client'
import { toAgreementStatus, type RawAgreementStatus } from './mappers'
import { GUARDIAN_CONSENT_COPY } from '../legal/consents'
import type { AgreementStatus, AgreementSubmission, ID } from '../types/api'

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

/**
 * POST /groups/:id/agreements — 아동 보호자 동의 확보 확인(선생님 전용·멱등).
 * 확인은 **선생님별·모임별**로 쌓인다(다른 선생님의 확인으로 갈음되지 않는다) — 그래서 초대로
 * 합류한 선생님은 첫 업로드에서 자기 확인을 남긴다.
 * 버전은 화면에 보여준 확인 문장의 것(`GUARDIAN_CONSENT_COPY.version`)을 싣는다(CHMO-517 —
 * 종전 서버 조회 에코 폐지). 문장이 개정돼 서버 버전이 앞서면 VALID400으로 거부되고, 그 계정은
 * 새 배포에서 다시 확인 대상이 된다.
 * 철회는 없다 — 이미 올라간 사진의 근거를 없애는 행위라 사진 삭제로 처리한다(BE 계약).
 */
export async function attestGuardianConsent(
  groupId: ID | string,
  signal?: AbortSignal,
): Promise<void> {
  await apiFetch<unknown>(`/groups/${groupId}/agreements`, {
    method: 'POST',
    body: { version: GUARDIAN_CONSENT_COPY.version },
    signal,
  })
}
