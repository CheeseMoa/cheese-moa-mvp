/**
 * 실 BE 도메인 에러 code → FE 의미 코드(docs/api-spec.md 어휘) 정규화.
 *
 * BE는 `{도메인}{HTTP status}` 형태(AUTH401, COMMON401, MOMENT404 …)의 코드를 쓰고,
 * FE 화면·목(MSW)은 api-spec의 의미 코드(INVALID_PIN, UNAUTHORIZED …)로 분기한다.
 * 매핑에 없는 코드는 그대로 통과 — 화면 분기는 대부분 status(401/404/409) 기반이고,
 * BE message는 이미 한국어라 그대로 노출해도 안전하다.
 *
 * 근거: 2026-07-09 실서버 curl 대조(AUTH400·AUTH401·COMMON401) + CHMO-191 스토리
 * (JOIN403·MOMENT404·ALBUM404) + 2026-07-16 참여 실패 채집(SPACE404 — CHMO-285)
 * + 2026-07-21 실서버 채집(OAUTH400 — 애플 미배포 시점의 `/auth/social/apple`) 및 BE ErrorStatus
 * 대조(OAUTH401·OAUTH502 — 콜백이 `?error=`로, exchange가 응답 code로 싣는다)
 * + 2026-07-22 실서버 채집(PUBLISH409 — CHMO-265 착수 중, 재공개 게이트 CHMO-324).
 * 새 코드를 확인하면 여기에만 추가하면 된다.
 */
const BE_CODE_MAP: Record<string, string> = {
  /** PIN 형식 오류(400) — "PIN은 4자리 숫자여야 합니다." */
  AUTH400: 'INVALID_PIN',
  /** 로그인 실패(401) — "닉네임 또는 PIN이 일치하지 않습니다." (토큰 무효와 구분됨) */
  AUTH401: 'INVALID_CREDENTIALS',
  /** 인증 필요/토큰 무효(401) — "인증이 필요합니다." */
  COMMON401: 'UNAUTHORIZED',
  /** 모임 참여 비밀번호 불일치(403) */
  JOIN403: 'WRONG_PASSWORD',
  /** 모임(BE 도메인명 space) 없음(404) — "모임을 찾을 수 없습니다." */
  SPACE404: 'NOT_FOUND',
  /** 이벤트(BE 도메인명 moment) 없음(404) */
  MOMENT404: 'NOT_FOUND',
  /** 앨범 없음(404) */
  ALBUM404: 'NOT_FOUND',
  /** 공개 시 미검토 사진 존재(409) — 14가 이 코드로 force 재시도를 분기한다(CHMO-324) */
  PUBLISH409: 'HAS_UNREVIEWED_PHOTOS',
  /** 지원하지 않는 소셜 프로바이더(400) — 경로 변수가 BE 미구현 값 (CHMO-359) */
  OAUTH400: 'UNSUPPORTED_SOCIAL_PROVIDER',
  /** 소셜 인가 실패(401) — 사용자 동의 취소·일회용 코드 무효/만료/재사용 */
  OAUTH401: 'SOCIAL_AUTH_FAILED',
  /** 소셜 프로바이더 통신 실패(502) — 우리 잘못도 사용자 잘못도 아닌 경우 */
  OAUTH502: 'SOCIAL_PROVIDER_ERROR',
}

/** BE 에러 code를 FE 의미 코드로 변환(미지의 코드는 그대로 통과) */
export function toFeErrorCode(beCode: string): string {
  return BE_CODE_MAP[beCode] ?? beCode
}
