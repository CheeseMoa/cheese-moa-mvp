/**
 * UUID v4 — 어드민 쓰기의 `Idempotency-Key`(혜택 푸시 CHMO-928 · 장수 조정·기관 기간 등록·패스 지급
 * CHMO-932)가 쓴다. `crypto.randomUUID`는 보안 컨텍스트 전용이라(http 사설 IP 접속 등) 폴백을 둔다.
 *
 * 키의 생애는 **다이얼로그 한 번**이다 — 열 때 만들고 전송 실패 뒤 재시도에만 같은 키를 쓰며, 성공하면
 * 버린다. 같은 키로 다른 내용을 보내면 서버가 ADMIN409로 거절한다(ADR 045).
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
