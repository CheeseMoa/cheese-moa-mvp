/**
 * 클립보드 복사. Clipboard API가 없거나(비보안 컨텍스트 — http LAN 실기기 테스트 등)
 * 거부되면 임시 textarea + execCommand('copy') 레거시 경로로 폴백한다.
 * 그래도 실패하면 false — 호출부가 실패 토스트를 띄운다.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 권한 거부 등 — 아래 레거시 경로로 폴백
    }
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  // 보이지 않게 + 포커스 이동으로 인한 스크롤 점프 방지
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length) // iOS Safari는 select()만으로 선택되지 않음
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
