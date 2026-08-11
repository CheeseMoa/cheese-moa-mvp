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

/**
 * MIME → 확장자 폴백(CHMO-597). 카메라 촬영본은 기기·픽커에 따라 확장자 없는 이름
 * (콘텐츠 URI 파생)으로 와서 이름만 보면 멀쩡한 JPEG도 걸러진다 — 브라우저가 아는
 * MIME(`File.type`)으로 확장자를 유도한다. `image/heif`는 BE 화이트리스트에 없어
 * 같은 컨테이너 계열 heic로 수렴한다.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/webp': 'webp',
}

/**
 * presign에 보낼 파일명 — 이름에 허용 확장자가 있으면 그대로, 없으면 MIME에서 유도한
 * 확장자를 덧붙여 보정한다. 지원 밖(둘 다 실패)이면 null — 종전대로 선택 시점에 제외.
 *
 * 이름 보정이 곧 계약 적합이다: BE는 파일명 확장자로 Content-Type을 정하고(위 CONTENT_TYPES),
 * S3 PUT의 Content-Type은 presign 응답 값을 그대로 쓰므로 서명 불일치도 없다.
 */
export function uploadFileNameFor(fileName: string, mimeType: string): string | null {
  if (uploadExtensionOf(fileName)) return fileName
  const extension = EXTENSION_BY_MIME[mimeType.trim().toLowerCase()]
  if (!extension) return null
  // 끝 점만 정리하고 나머지 이름은 보존한다(a. → a.jpg). 빈 이름(픽커에 따라 옴)은 photo로.
  const base = fileName.endsWith('.') ? fileName.slice(0, -1) : fileName
  return `${base || 'photo'}.${extension}`
}

/** BE `@Positive` + 20MB 상한 */
export function isUploadableSize(size: number): boolean {
  return size > 0 && size <= MAX_UPLOAD_FILE_BYTES
}
