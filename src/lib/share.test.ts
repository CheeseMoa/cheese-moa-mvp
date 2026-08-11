/**
 * CHMO-663 — 공유 전달.
 *
 * 고정하는 것은 하나다: **본문과 링크를 한 필드로 넘긴다.** `{text, url}`로 나눠 넘기면
 * 수신 앱이 무엇을 집을지가 브라우저 구현에 달려 있어(iOS Safari는 url만 채택하는 앱이 있다)
 * 카카오톡 대화방에 링크만 들어가고 비밀번호·안내가 사라진다. 눈에 보이는 회귀가 실기기에서만
 * 드러나는 종류라, 필드 모양을 테스트로 못 박는다.
 *
 * clipboard는 document를 쓰는 레거시 폴백이 있어(node 환경엔 document가 없다) 모듈째 대체한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard } from './clipboard'
import { shareOrCopy } from './share'

vi.mock('./clipboard', () => ({ copyToClipboard: vi.fn() }))

const PAYLOAD = {
  text: '🧀 치즈모아 모임에 초대해요!\n비밀번호: 6007',
  url: 'https://app.cheese-moa.com/join/abc123?type=general&name=%EB%B4%84%20%EC%86%8C%ED%92%8D',
}
/** 공유·복사 두 경로가 함께 쓰는 문자열 — 어느 길로 가도 받는 사람이 보는 내용이 같다 */
const MESSAGE = `${PAYLOAD.text}\n${PAYLOAD.url}`

beforeEach(() => {
  vi.mocked(copyToClipboard).mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('shareOrCopy', () => {
  it('본문과 링크를 한 덩어리로 넘긴다 — url을 별도 필드로 싣지 않는다', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })

    expect(await shareOrCopy(PAYLOAD)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: MESSAGE })
    // url 필드가 함께 실리면 Android가 링크를 두 번 붙인다(이어 붙이는 구현이라)
    expect(share.mock.calls[0][0]).not.toHaveProperty('url')
    expect(copyToClipboard).not.toHaveBeenCalled()
  })

  it('시트를 닫은 취소는 복사로 폴백하지 않는다', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'))
    vi.stubGlobal('navigator', { share })

    expect(await shareOrCopy(PAYLOAD)).toBe('canceled')
    expect(copyToClipboard).not.toHaveBeenCalled()
  })

  it('공유가 막힌 웹뷰에서는 같은 문자열을 복사한다', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
    vi.stubGlobal('navigator', { share })

    expect(await shareOrCopy(PAYLOAD)).toBe('copied')
    expect(copyToClipboard).toHaveBeenCalledWith(MESSAGE)
  })

  it('Web Share 미지원 환경도 같은 문자열을 복사한다', async () => {
    vi.stubGlobal('navigator', {})

    expect(await shareOrCopy(PAYLOAD)).toBe('copied')
    expect(copyToClipboard).toHaveBeenCalledWith(MESSAGE)
  })

  it('복사까지 실패하면 실패로 알린다', async () => {
    vi.stubGlobal('navigator', {})
    vi.mocked(copyToClipboard).mockResolvedValue(false)

    expect(await shareOrCopy(PAYLOAD)).toBe('failed')
  })
})
