/**
 * 업로드 미리보기용 축소 썸네일 (CHMO-369 · CHMO-497).
 *
 * 06-U는 기기에서 고른 원본(12MP·수 MB급)을 `URL.createObjectURL`로 타일에 그대로
 * 꽂았는데, 수십 장이면 브라우저가 원본 전부를 디코드해 피커 복귀 직후 프리즈·메모리
 * 압박이 생긴다. 타일 크기에 맞는 작은 JPEG로 줄인 blob URL을 만들어 대신 쓴다.
 *
 * **원본 디코드는 장당 1회**(CHMO-497) — 호출부는 원본 objectURL을 타일에 꽂지 않고
 * 여기서 만든 썸네일을 기다린다. 예전엔 타일이 원본을 한 번, 이 함수가 또 한 번 디코드했다.
 */

/** 3열 타일(약 120px)의 레티나 3배 여유 — 이보다 큰 원본만 여기까지 줄인다(확대는 안 한다) */
const THUMB_MAX_EDGE = 360
const THUMB_JPEG_QUALITY = 0.8

/**
 * 파일을 축소 썸네일 blob URL로 변환한다. 반환된 URL은 호출부가 revoke를 소유한다.
 * 브라우저가 파일을 아예 못 읽거나 캔버스가 막힌 경우에만 null — 호출부는 그때 원본
 * objectURL로 폴백한다(기존 동작 유지).
 */
export async function createPreviewThumbnail(file: File): Promise<string | null> {
  try {
    const blob = await createThumbnailBlob(file)
    return blob ? URL.createObjectURL(blob) : null
  } catch {
    // 한 장의 실패가 배치 전체를 끊지 않게 여기서 삼킨다 — 호출부는 원본으로 폴백한다
    return null
  }
}

/**
 * **디코드는 정확히 한 경로에서만 일어난다** — 비트맵 경로가 파일을 읽어 냈으면 굽기가 실패해도
 * `<img>`로 되돌아가지 않는다(그랬다간 같은 원본을 두 번 디코드한다, AC-1).
 */
async function createThumbnailBlob(file: File): Promise<Blob | null> {
  const bitmap = await decodeToBitmap(file)
  if (!bitmap) return thumbnailViaImageElement(file)
  try {
    return await drawToJpegBlob(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close() // 디코드 결과를 즉시 해제 — GC를 기다리면 100장에서 피크가 쌓인다
  }
}

/**
 * 1순위 경로 — `createImageBitmap`은 **디코드 단계에서 바로 축소**할 수 있어(resize 옵션)
 * 원본 해상도 비트맵을 메모리에 올리지 않는다. 100장 배치에서 차이가 크다.
 *
 * resize 옵션을 무시하는 브라우저(Safari 구버전 등)는 원본 크기 비트맵을 돌려주는데,
 * 그래도 뒤이은 캔버스 축소가 같은 결과를 만든다 — 그래서 **지원 여부를 미리 감지하지 않는다**
 * (능력 감지 없이 양쪽 다 옳게 동작하는 쪽이 실기기 편차에 강하다).
 * HEIC처럼 이 API가 못 읽는 포맷은 예외로 떨어져 `<img>` 폴백이 받는다.
 */
async function decodeToBitmap(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    // 가로 기준으로만 줄인다(세로는 종횡비 유지) — 원본 비율을 모르는 채 양변을 지정하면
    // 이미지가 찌그러진다. 세로 사진은 긴 변이 THUMB_MAX_EDGE를 넘을 수 있어 캔버스가 마저 줄인다.
    return await createImageBitmap(file, { resizeWidth: THUMB_MAX_EDGE, resizeQuality: 'medium' })
  } catch {
    return null
  }
}

/** 폴백 경로 — `createImageBitmap`이 없거나 파일 포맷을 못 읽을 때. 원본 디코드는 여기서도 1회다. */
async function thumbnailViaImageElement(file: File): Promise<Blob | null> {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = sourceUrl
    await image.decode()
    return await drawToJpegBlob(image, image.naturalWidth, image.naturalHeight)
  } catch {
    return null
  } finally {
    // 여기서 만든 원본 URL은 여기서 해제 — 타일에 꽂힌 URL(호출부 소유)과 별개다
    URL.revokeObjectURL(sourceUrl)
  }
}

/** 디코드된 이미지를 긴 변 THUMB_MAX_EDGE 이하로 줄여 JPEG blob으로 굽는다(확대는 하지 않는다). */
async function drawToJpegBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (!width || !height) return null
  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', THUMB_JPEG_QUALITY),
  )
}
