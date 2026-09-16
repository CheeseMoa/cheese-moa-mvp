import { useEffect } from 'react'

/**
 * 어드민 토스트 (CHMO-811) — 쓰기 액션의 결과 한 줄. 서비스 ToastProvider를 쓰지 않는 이유는
 * 그것이 폰 프레임(PhoneShell 박스)을 복제한 고스트 프레임 안에 배치되기 때문이다 —
 * 데스크탑 어드민에서는 화면 한가운데 좁은 띠로 뜬다. 여기서는 콘텐츠 우측 하단에 둔다.
 *
 * 한 번에 하나(호출부가 문자열 하나를 들고 있다)이고, 같은 문구를 다시 띄워도 타이머가
 * 새로 돈다(`nonce` — 문자열이 같으면 useEffect가 다시 안 돌아 토스트가 조용히 사라진다).
 */
export function AdminToast({
  message,
  nonce,
  onDismiss,
}: {
  message: string
  nonce: number
  onDismiss: () => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000)
    return () => window.clearTimeout(timer)
  }, [nonce, onDismiss])

  return (
    <div className="pointer-events-none fixed bottom-6 right-7 z-50">
      <div
        role="status"
        className="pointer-events-auto max-w-md rounded-lg bg-admin-text px-4 py-3 text-[13px] leading-relaxed text-white shadow-lg"
      >
        {message}
      </div>
    </div>
  )
}
