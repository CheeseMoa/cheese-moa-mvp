/**
 * 참여 코드(joinKey)·참여 비밀번호 형식 규칙 단일 원천 — 변경 모달(20)과 목 핸들러가 공유한다
 * (`lib/pin.ts`·`lib/upload.ts` 관용). 규칙 원천은 **BE CHMO-673의 `@Pattern`** 이고 여기는
 * 그 거울이다 — BE가 규칙을 바꾸면 여기 한 곳만 고친다.
 *
 * **한글은 허용하지 않는다**(BE 결정 70e889e): 같은 글자가 유니코드 정규화(NFC/NFD)에 따라 다른
 * 값이 돼 저장된 코드와 입력한 코드가 눈으로는 같은데 매칭이 안 되는 함정이 있다.
 *
 * 매칭은 **대소문자를 구분한다**(CHMO-285 — 현행 계약 유지). 그래서 입력을 대문자로 바꾸거나
 * 하는 정규화를 여기서도 하지 않는다: 사용자가 `familytrip`으로 정했으면 그 값 그대로가 코드다.
 */

/** 참여 코드 — 영문·숫자 4~20자 */
export const JOIN_KEY_RE = /^[A-Za-z0-9]{4,20}$/
export const JOIN_KEY_MAX = 20

/**
 * 참여 비밀번호 — 영문·숫자 4~12자. 자동 발급값(숫자 4자리)보다 넓은 이유는 **사람이 정한 코드는
 * 추측 가능한 값**이라(가족여행2026 같은) 비밀번호가 유일한 비밀이 되기 때문이다(BE f27144c):
 * 숫자 4자리 1만 조합은 요청 리미터 아래에서도 1~2주면 전수 대입이 되므로 강도를 사용자가
 * 고를 수 있게 열어 둔다. 자동 발급 비밀번호는 4자리 유지(코드가 난수라 안전).
 */
export const JOIN_PASSWORD_RE = /^[A-Za-z0-9]{4,12}$/
export const JOIN_PASSWORD_MAX = 12

/** 입력 안내·에러 문구가 공유하는 규칙 표현 */
export const JOIN_KEY_RULE_TEXT = '영문·숫자 4~20자'
export const JOIN_PASSWORD_RULE_TEXT = '영문·숫자 4~12자'

/** 허용 문자만 남기고 상한까지 자른다 — 형식 위반(VALID400)을 입력 시점에 선차단 */
export function sanitizeJoinSecretInput(value: string, maxLength: number): string {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, maxLength)
}

/**
 * 형식 위반 문구(위반이 없으면 null) — 서버 문구를 흉내 내지 않고 FE가 소유한다.
 * 화면이 제출 전에 막으므로 BE @Pattern 메시지(미채집)는 실제로는 도달하지 않는다.
 */
export function joinKeyFormatError(value: string): string | null {
  return JOIN_KEY_RE.test(value) ? null : `참여 코드는 ${JOIN_KEY_RULE_TEXT}로 입력해 주세요.`
}

export function joinPasswordFormatError(value: string): string | null {
  return JOIN_PASSWORD_RE.test(value) ? null : `비밀번호는 ${JOIN_PASSWORD_RULE_TEXT}로 입력해 주세요.`
}
