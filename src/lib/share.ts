import { copyToClipboard } from './clipboard'

export interface SharePayload {
  /** 본문(비밀번호 등 안내 포함, URL 제외 — Android는 text와 url을 이어 붙여 전달하므로 중복 방지) */
  text: string
  url: string
}

export type ShareOutcome = 'shared' | 'copied' | 'canceled' | 'failed'

/**
 * OS 네이티브 공유 시트(Web Share API)로 텍스트+링크 공유. 카카오톡·라인·문자 등
 * 설치된 앱이 대상이 된다. 미지원 환경(데스크탑 일부·http LAN 실기기)이나 권한 차단
 * 웹뷰에서는 전체 메시지 클립보드 복사로 폴백 — 호출부가 outcome별 토스트를 띄운다.
 * 사용자가 시트를 닫은 취소(AbortError)는 정상 흐름이라 폴백하지 않는다.
 */
export async function shareOrCopy({ text, url }: SharePayload): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ text, url })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'canceled'
      // 웹뷰 권한 차단 등 — 아래 복사 폴백
    }
  }
  return (await copyToClipboard(`${text}\n${url}`)) ? 'copied' : 'failed'
}
