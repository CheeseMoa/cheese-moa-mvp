import { describe, expect, it } from 'vitest'
import {
  isUploadableSize,
  MAX_UPLOAD_BATCH,
  MAX_UPLOAD_FILE_BYTES,
  uploadContentTypeOf,
  uploadExtensionOf,
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
    // presign·등록 요청당 @Size(max = 50). 200~300장 경로는 CHMO-217이 열어 준다.
    expect(MAX_UPLOAD_BATCH).toBe(50)
  })
})
