/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MSW 목 API 부트스트랩 여부 ('true'일 때만 워커 시작) */
  readonly VITE_ENABLE_MSW?: string
  /** API 오리진 — vite 프록시 대상이자 소셜 로그인 시작 URL의 베이스(CHMO-359). 기본 실서버 */
  readonly VITE_API_ORIGIN?: string
  /** 'true'면 API를 VITE_API_ORIGIN으로 직접 호출(프록시·rewrite 미경유) — 개발환경 Vercel 배포용(CHMO-573). MSW와 병용 금지 */
  readonly VITE_API_DIRECT?: string
  /** Amplitude API 키(CHMO-660) — **없으면 추적 전체가 no-op**. 넣는 순간 처리방침 §11·§8·§9 개정이 함께 나가야 한다 */
  readonly VITE_AMPLITUDE_API_KEY?: string
  /** Amplitude 프로젝트를 EU 리전으로 만든 경우에만 'EU' — 안 맞으면 이벤트가 조용히 버려진다 */
  readonly VITE_AMPLITUDE_SERVER_ZONE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
