/**
 * 업로드 미리보기용 축소 썸네일 (CHMO-369).
 *
 * 06-U는 기기에서 고른 원본(12MP·수 MB급)을 `URL.createObjectURL`로 타일에 그대로
 * 꽂았는데, 수십 장이면 브라우저가 원본 전부를 디코드해 피커 복귀 직후 프리즈·메모리
 * 압박이 생긴다. 타일 크기에 맞는 작은 JPEG로 줄인 blob URL을 만들어 대신 쓴다.
 */

/** 3열 타일(약 120px)의 레티나 3배 여유 — 이보다 작은 원본은 축소하지 않는다 */
const THUMB_MAX_EDGE = 360
const THUMB_JPEG_QUALITY = 0.8

/**
 * 파일을 축소 썸네일 blob URL로 변환한다. 반환된 URL은 호출부가 revoke를 소유한다.
 * 디코드 실패(브라우저가 못 읽는 포맷 등)·축소가 무의미한 작은 원본이면 null —
 * 호출부는 원본 objectURL을 그대로 쓴다(기존 동작 폴백).
 */
export async function createPreviewThumbnail(file: File): Promise<string | null> {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = sourceUrl
    await image.decode()
    const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    if (scale === 1) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', THUMB_JPEG_QUALITY),
    )
    return blob ? URL.createObjectURL(blob) : null
  } catch {
    return null
  } finally {
    // 여기서 만든 원본 URL은 여기서 해제 — 타일에 꽂힌 URL(호출부 소유)과 별개다
    URL.revokeObjectURL(sourceUrl)
  }
}
