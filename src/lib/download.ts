/**
 * URL을 blob으로 받아 같은 출처 임시 URL로 저장을 트리거한다.
 * 앵커 직접 다운로드의 두 함정을 피한다: ① 교차 출처 URL(사진 CDN)에선 download
 * 속성이 무시돼 저장 대신 새 탭이 열림 ② 앵커 내비게이션은 일부 브라우저(Firefox)에서
 * 서비스워커를 우회해 MSW 목 zip이 404가 됨 — fetch는 항상 서비스워커를 탄다.
 * 실패 시 false — 호출부가 실패 토스트를 띄운다.
 */
export async function downloadViaBlob(url: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 즉시 revoke하면 일부 브라우저가 시작 전 저장을 취소한다 — 지연 해제
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    return true
  } catch {
    return false
  }
}
