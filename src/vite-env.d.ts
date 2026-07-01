/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MSW 목 API 부트스트랩 여부 ('true'일 때만 워커 시작) */
  readonly VITE_ENABLE_MSW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
