/**
 * 닫기 아이콘 (CHMO-862) — 글리프(✕)는 서체마다 굵기·크기가 달라 버튼 안에서 겉돈다.
 * 서비스 아이콘 세트(components/ui/icons)와 같은 규격(viewBox 24·스트로크 1.8·currentColor)으로
 * 어드민 안에 따로 둔다 — 화면 컴포넌트는 서비스와 공유하지 않는다(격리 규칙 §2-2).
 */
export function AdminCloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
