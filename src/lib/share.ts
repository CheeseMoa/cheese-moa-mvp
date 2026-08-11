import { copyToClipboard } from './clipboard'

export interface SharePayload {
  /** 안내 본문(비밀번호 등) — 링크는 아래 url로 주면 이 모듈이 한 덩어리로 합친다 */
  text: string
  url: string
}

export type ShareOutcome = 'shared' | 'copied' | 'canceled' | 'failed'

/**
 * OS 네이티브 공유 시트(Web Share API)로 안내 문구+링크 공유. 카카오톡·라인·문자 등
 * 설치된 앱이 대상이 된다. 미지원 환경(데스크탑 일부·http LAN 실기기)이나 권한 차단
 * 웹뷰에서는 전체 메시지 클립보드 복사로 폴백 — 호출부가 outcome별 토스트를 띄운다.
 * 사용자가 시트를 닫은 취소(AbortError)는 정상 흐름이라 폴백하지 않는다.
 *
 * **본문과 링크는 한 필드로 합쳐 넘긴다**(CHMO-663). `{text, url}`로 나눠 넘기면 수신 앱에
 * 무엇이 도착할지가 브라우저 구현에 달린다 — Chrome Android는 둘을 이어 붙이지만, iOS
 * Safari는 활동 항목 둘을 그대로 넘겨 카카오톡 같은 앱이 **url만 집고 text를 버린다**
 * (대화방에 링크만 들어가고 비밀번호·안내가 통째로 사라진다). 한 덩어리면 어느 구현이든
 * 전문이 전달되고, 복사 폴백과도 같은 문자열이 된다.
 */
export async function shareOrCopy({ text, url }: SharePayload): Promise<ShareOutcome> {
  const message = `${text}\n${url}`
  if (navigator.share) {
    try {
      await navigator.share({ text: message })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'canceled'
      // 웹뷰 권한 차단 등 — 아래 복사 폴백
    }
  }
  return (await copyToClipboard(message)) ? 'copied' : 'failed'
}
