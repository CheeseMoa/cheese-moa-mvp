import { describe, expect, it } from 'vitest'
import {
  isUploadableSize,
  MAX_UPLOAD_BATCH,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_PICK,
  uploadContentTypeOf,
  uploadExtensionOf,
  uploadFileNameFor,
} from './upload'

/**
 * 업로드 제약은 BE를 옮겨 적은 값이다 — 어긋나면 BE가 배치 전체를 400으로 거절한다.
 * 화이트리스트 밖 파일을 하나라도 통과시키면 사용자는 "왜 전부 실패하지"를 보게 된다.
 */
describe('uploadContentTypeOf', () => {
  it('확장자는 대소문자를 가리지 않는다 — 실 BE도 a.JPG에 image/jpeg를 돌려준다', () => {
    expect(uploadContentTypeOf('a.JPG')).toBe('image/jpeg')
    expect(uploadContentTypeOf('a.jpg')).toBe('image/jpeg')
    expect(uploadContentTypeOf('a.jpeg')).toBe('image/jpeg')
  })

  it('화이트리스트 전체를 BE와 같은 MIME으로 옮긴다', () => {
    expect(uploadContentTypeOf('a.png')).toBe('image/png')
    expect(uploadContentTypeOf('a.heic')).toBe('image/heic')
    expect(uploadContentTypeOf('a.webp')).toBe('image/webp')
  })

  it('점이 여러 개면 마지막 확장자를 본다', () => {
    expect(uploadContentTypeOf('2026.여름.물놀이.png')).toBe('image/png')
  })

  it('화이트리스트 밖이거나 확장자가 없으면 null — 파일 선택 시점에 걸러 낸다', () => {
    expect(uploadContentTypeOf('a.gif')).toBeNull()
    expect(uploadContentTypeOf('a.mp4')).toBeNull()
    expect(uploadContentTypeOf('확장자없음')).toBeNull()
    expect(uploadContentTypeOf('a.')).toBeNull()
  })
})

/**
 * 카메라 촬영본은 픽커에 따라 확장자 없는 이름(콘텐츠 URI 파생)으로 온다(CHMO-597) —
 * 이름 확장자가 없으면 MIME으로 보정한 파일명을 presign에 보낸다. 보정 결과는 반드시
 * BE 화이트리스트(위 CONTENT_TYPES)를 통과해야 한다.
 */
describe('uploadFileNameFor', () => {
  it('허용 확장자가 있으면 이름을 그대로 쓴다 — MIME이 비거나 어긋나도 이름이 우선', () => {
    expect(uploadFileNameFor('a.jpg', 'image/jpeg')).toBe('a.jpg')
    expect(uploadFileNameFor('a.HEIC', '')).toBe('a.HEIC')
    expect(uploadFileNameFor('a.png', 'application/octet-stream')).toBe('a.png')
  })

  it('확장자 없는 이름은 MIME에서 확장자를 유도해 보정한다', () => {
    expect(uploadFileNameFor('1000001234', 'image/jpeg')).toBe('1000001234.jpg')
    expect(uploadFileNameFor('capture', 'image/png')).toBe('capture.png')
    expect(uploadFileNameFor('capture', 'image/webp')).toBe('capture.webp')
  })

  it('image/heif는 BE 화이트리스트에 없어 heic로 수렴한다', () => {
    expect(uploadFileNameFor('IMG_0001', 'image/heif')).toBe('IMG_0001.heic')
    expect(uploadFileNameFor('IMG_0001.heif', 'image/heif')).toBe('IMG_0001.heif.heic')
    expect(uploadFileNameFor('IMG_0001', 'image/heic')).toBe('IMG_0001.heic')
  })

  it('빈 이름·끝 점 이름도 유효한 파일명으로 보정한다', () => {
    expect(uploadFileNameFor('', 'image/jpeg')).toBe('photo.jpg')
    expect(uploadFileNameFor('a.', 'image/jpeg')).toBe('a.jpg')
  })

  it('이름도 MIME도 지원 밖이면 null — 종전대로 선택 시점에 제외한다', () => {
    expect(uploadFileNameFor('a.gif', 'image/gif')).toBeNull()
    expect(uploadFileNameFor('clip', 'video/mp4')).toBeNull()
    expect(uploadFileNameFor('확장자없음', '')).toBeNull()
  })

  it('보정한 파일명은 반드시 화이트리스트를 통과한다 — presign에 그대로 실리는 값', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']) {
      const corrected = uploadFileNameFor('capture', mime)
      expect(corrected).not.toBeNull()
      expect(uploadContentTypeOf(corrected!)).not.toBeNull()
    }
  })
})

describe('uploadExtensionOf', () => {
  it('소문자 확장자를 돌려준다 — s3Key도 소문자로 발급된다', () => {
    expect(uploadExtensionOf('a.JPG')).toBe('jpg')
    expect(uploadExtensionOf('a.HEIC')).toBe('heic')
    expect(uploadExtensionOf('a.gif')).toBeNull()
  })
})

describe('isUploadableSize', () => {
  it('0바이트 파일은 거절한다 (BE @Positive)', () => {
    expect(isUploadableSize(0)).toBe(false)
    expect(isUploadableSize(-1)).toBe(false)
  })

  it('경계는 20MB 이하까지 허용한다', () => {
    expect(isUploadableSize(1)).toBe(true)
    expect(isUploadableSize(MAX_UPLOAD_FILE_BYTES)).toBe(true)
    expect(isUploadableSize(MAX_UPLOAD_FILE_BYTES + 1)).toBe(false)
  })
})

describe('업로드 상한', () => {
  it('BE 제약을 그대로 옮긴 값이다 — 바꾸려면 BE가 먼저 바뀌어야 한다', () => {
    expect(MAX_UPLOAD_FILE_BYTES).toBe(20 * 1024 * 1024)
    // presign·등록 요청당 @Size(max = 500) — 2026-07-28 실서버 실측(501장 → VALID400), CHMO-482.
    expect(MAX_UPLOAD_BATCH).toBe(500)
  })

  it('화면 상한은 BE 계약 상한과 별개지만 넘어서면 안 된다', () => {
    // 웹이 스스로 거는 값(CHMO-497) — BE가 더 받아 줘도 브라우저 부담 때문에 100에서 끊는다.
    expect(MAX_UPLOAD_PICK).toBe(100)
    // 화면 상한이 BE 상한을 넘으면 BE가 배치 전체를 400으로 거절한다 — 상수를 올릴 때의 안전선.
    expect(MAX_UPLOAD_PICK).toBeLessThanOrEqual(MAX_UPLOAD_BATCH)
  })
})
