/**
 * 업로드 제약 단일 원천 — UI(06-U)와 MSW 목이 함께 쓴다(`pin.ts`와 같은 역할).
 *
 * 값은 전부 BE 제약을 그대로 옮긴 것이다. BE가 바뀌면 여기만 고친다.
 * 이 제약을 어긴 파일이 하나라도 섞이면 BE는 **배치 전체를 400으로 거절**하므로
 * 파일 선택 시점에 걸러 낸다.
 */

/**
 * BE `PhotoKeyGenerator.CONTENT_TYPES` — BE는 파일의 MIME이 아니라 **파일명 확장자**로
 * Content-Type을 정하고, 화이트리스트 밖이면 `UNSUPPORTED_FILE_TYPE`을 던진다.
 */
const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
}

/** 허용 형식 안내 문구 — 토스트·도움말 공용 */
export const UPLOAD_FORMAT_LABEL = 'JPG·PNG·HEIC·WEBP'

/** BE `IssueUploadUrlsUseCase.MAX_FILE_SIZE_BYTES` — 파일당 20MB */
export const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024
export const MAX_UPLOAD_FILE_LABEL = '20MB'

/**
 * BE `PresignRequest`·`RegisterPhotosRequest`의 `@Size(max = 500)` — presign·등록 한 번에 담을
 * 최대 장수. **2026-07-28 실서버 실측**(501장 → `VALID400 "한 번에 500장까지 업로드할 수 있습니다."`,
 * presign·등록 양쪽 동일)으로 CHMO-482 상향 배포를 확인했다.
 *
 * 이건 **BE가 받아 주는 수**일 뿐 화면이 거는 상한이 아니다 — 06-U는 `MAX_UPLOAD_PICK`을 쓴다.
 */
export const MAX_UPLOAD_BATCH = 500

/**
 * 웹(06-U)이 한 번에 담는 최대 장수 — BE 계약 상한과 **일부러 분리한** 값이다(CHMO-497).
 * 브라우저는 고른 파일을 전부 디코드해 미리보기를 만들어야 해서 장수가 곧 CPU·메모리 부담이고,
 * 500장 규모는 앱의 네이티브 업로드가 맡는다(하이브리드 전환). BE 상한이 더 올라가도 웹은 이 값을
 * 지킨다. 다만 이 값이 `MAX_UPLOAD_BATCH`를 넘으면 BE가 배치 전체를 400으로 거절한다.
 */
export const MAX_UPLOAD_PICK = 100

/** 소문자 확장자(화이트리스트 밖이거나 확장자가 없으면 null) */
export function uploadExtensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0 || dot === fileName.length - 1) return null
  const extension = fileName.slice(dot + 1).toLowerCase()
  return extension in CONTENT_TYPES ? extension : null
}

/** 확장자에서 유도한 Content-Type(화이트리스트 밖이면 null) — BE와 동일 규칙 */
export function uploadContentTypeOf(fileName: string): string | null {
  const extension = uploadExtensionOf(fileName)
  return extension ? CONTENT_TYPES[extension] : null
}

/** BE `@Positive` + 20MB 상한 */
export function isUploadableSize(size: number): boolean {
  return size > 0 && size <= MAX_UPLOAD_FILE_BYTES
}
