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
 * + 2026-07-22 실서버 채집(PUBLISH409 — CHMO-265 착수 중, 재공개 게이트 CHMO-324)
 * + 2026-07-28 BE 완료 공지(SPACE403 — 선생님 합류 승인제 CHMO-475 AC2. 실서버 채집은
 *   학부모 전환 배포 후 CHMO-449에서)
 * + 2026-07-30 BE 소스 대조(AGREEMENT428 — 약관 동의 기록 CHMO-514 PR #154의 ErrorStatus.
 *   실서버 채집은 BE 배포 후)
 * + 2026-07-31 BE 소스 대조(MEMBER409 — 멤버 내보내기·나가기 CHMO-525 PR #155의
 *   ErrorStatus.LAST_TEACHER. 실서버 채집은 BE 배포 후)
 * + 2026-08-03 BE 소스 대조(MOMENT409 — ErrorStatus.MOMENT_ANALYZING. 모임 삭제·마지막 선생님
 *   나가기의 분석 중 가드, CHMO-564 스펙 확인. 실서버 채집은 BE 배포 후)
 * + 2026-08-04 실서버 채집(ADMIN403 — 비관리자 토큰의 `/admin/*` 호출. CHMO-377 가드 배포 확인,
 *   CHMO-379 착수 프로브)
 * + 2026-08-06 BE 소스 대조(AUTH409 — ErrorStatus.NICKNAME_TAKEN. 가입 동의 동봉 CHMO-600 착수 중
 *   확인 — CHMO-598 스펙 문서의 USER409 표기는 소스와 달라 소스를 따른다. 실서버 채집은 미완).
 * 새 코드를 확인하면 여기에만 추가하면 된다.
 */
const BE_CODE_MAP: Record<string, string> = {
  /** PIN 형식 오류(400) — "PIN은 4자리 숫자여야 합니다." */
  AUTH400: 'INVALID_PIN',
  /** 로그인 실패(401) — "닉네임 또는 PIN이 일치하지 않습니다." (토큰 무효와 구분됨) */
  AUTH401: 'INVALID_CREDENTIALS',
  /** 닉네임 중복(409) — "이미 사용 중인 닉네임입니다." 가입·PATCH /me 공용(BE NICKNAME_TAKEN) */
  AUTH409: 'NICKNAME_TAKEN',
  /** 인증 필요/토큰 무효(401) — "인증이 필요합니다." */
  COMMON401: 'UNAUTHORIZED',
  /** 모임 참여 비밀번호 불일치(403) */
  JOIN403: 'WRONG_PASSWORD',
  /**
   * 멤버지만 role 부족(403) — 예: PARENT가 업로드·검수·초대 조회 호출(학부모 전환 Q5 확정,
   * docs/parent-model-proposal.md §6). 멤버십 없음(SPACE404 은닉)과 구분된다.
   * 실 BE 미배포 — 코드 자체는 협의 확정이라 등록하고, 배포 후 실서버 채집으로 재확인한다.
   */
  ROLE403: 'FORBIDDEN_ROLE',
  /**
   * 승인 전 모임 접근(403 — BE NOT_SPACE_MEMBER) — 신청은 했지만 아직 ACTIVE가 아닌 멤버십으로
   * 모임 상세·이벤트·앨범을 호출한 경우. **선생님도 승인제로 통일**(BE CHMO-475 AC2)되면서
   * 제작자 화면에서도 닿을 수 있게 됐다(딥링크·북마크·승인 전 새로고침).
   * role 부족(ROLE403)과 달리 "기다리면 열린다"는 뜻이라, 화면은 재시도가 아니라 홈 복귀로 받는다.
   */
  SPACE403: 'PENDING_APPROVAL',
  /**
   * 멤버 **내보내기**로 ACTIVE 선생님이 0명이 되는 경우(409 — BE CHMO-525·564). 마지막 선생님의
   * **나가기**는 CHMO-564부터 거부가 아니라 모임 삭제로 승격돼 이 코드가 오지 않는다 — 남는 건
   * 동시 나가기 경쟁의 내보내기뿐이라, 화면은 서버 메시지("모임에는 최소 1명의 선생님이 남아야
   * 합니다.")를 그대로 노출한다(종전 "모임 삭제를 쓰라" 안내는 BE 메시지째 폐기됐다).
   */
  MEMBER409: 'LAST_TEACHER',
  /**
   * 모임 삭제·마지막 선생님 나가기인데 분석 중 이벤트가 있음(409 — BE MOMENT_ANALYZING,
   * CHMO-564 AC-3: 나가기로 모임 삭제의 분석 중 가드를 우회할 수 없다). BE 메시지가 삭제
   * 문맥("삭제할 수 없습니다")이라 나가기 화면(05)은 나가기 문맥 문구로 바꿔 안내한다.
   * 분석이 끝나면 풀리는 일시 상태다.
   */
  MOMENT409: 'MOMENT_ANALYZING',
  /**
   * 관리자가 아님(403) — "관리자 권한이 필요합니다." `/admin/*` 전용 가드(BE CHMO-377).
   * 어드민 가드(src/admin/AdminLayout)가 진입 차단 화면으로 받는다 — 기다려도 안 풀리는
   * 권한 문제라 재시도 CTA를 주지 않는다(CHMO-379).
   */
  ADMIN403: 'NOT_ADMIN',
  /** 모임(BE 도메인명 space) 없음(404) — "모임을 찾을 수 없습니다." */
  SPACE404: 'NOT_FOUND',
  /** 이벤트(BE 도메인명 moment) 없음(404) */
  MOMENT404: 'NOT_FOUND',
  /** 앨범 없음(404) */
  ALBUM404: 'NOT_FOUND',
  /**
   * 공개 시 미검토 사진 존재(409) — 전량 검토 완료가 하드 게이트라(CHMO-488) 우회가 없다.
   * 14는 애초에 버튼을 잠가 이 상태로 호출하지 않으므로, 실제로 오면 동시 작업 레이스다
   * (종전의 ?force=true 재시도 분기는 폐기 — CHMO-324·265).
   */
  PUBLISH409: 'HAS_UNREVIEWED_PHOTOS',
  /**
   * 아동 보호자 동의 확보 확인이 없는 모임의 업로드(428 Precondition Required — BE CHMO-514).
   * presign 단계에서만 온다. **막힌 게 아니라 조건이 빈 것**이라 화면은 에러 문구가 아니라
   * 확인 모달을 띄우고, 확인 기록(POST /groups/:id/agreements) 후 presign부터 재시도한다.
   * 확인은 선생님별·모임별 1회라 같은 모임의 다음 업로드엔 오지 않는다(CHMO-516).
   */
  AGREEMENT428: 'GUARDIAN_CONSENT_REQUIRED',
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
