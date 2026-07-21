/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MSW 목 API 부트스트랩 여부 ('true'일 때만 워커 시작) */
  readonly VITE_ENABLE_MSW?: string
  /** API 오리진 — vite 프록시 대상이자 소셜 로그인 시작 URL의 베이스(CHMO-359). 기본 실서버 */
  readonly VITE_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
