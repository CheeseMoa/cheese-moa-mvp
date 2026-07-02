import { useId } from 'react'

interface CheddarProps {
  /** 렌더 크기(px, 정사각) */
  size?: number
  className?: string
}

/**
 * 체다 — 헤더/엠블럼용 플랫 치즈 카메라 심볼.
 * 원본: docs/design/logo-v3.dc.html '02 정면 플랫' 계열(screen-system.dc.html #cheddar).
 */
export function Cheddar({ size = 30, className }: CheddarProps) {
  // 같은 화면에 여러 개 렌더돼도 그라데이션 id가 충돌하지 않도록 인스턴스별 id 사용
  const uid = useId()
  const gY = `${uid}-gy`
  const gHole = `${uid}-ghole`
  const gGlass = `${uid}-gglass`
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gY} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7C948" />
          <stop offset="1" stopColor="#F5B82E" />
        </linearGradient>
        <linearGradient id={gHole} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A86E12" />
          <stop offset="1" stopColor="#E8AC34" />
        </linearGradient>
        <radialGradient id={gGlass} cx="38%" cy="32%" r="78%">
          <stop offset="0" stopColor="#86612C" />
          <stop offset="0.55" stopColor="#4A3415" />
          <stop offset="1" stopColor="#291B0A" />
        </radialGradient>
      </defs>
      <rect x="102" y="54" width="24" height="22" rx="8" fill="#E8890C" />
      <ellipse cx="114" cy="56" rx="12" ry="4" fill="#FFD66A" />
      <rect x="150" y="62" width="24" height="16" rx="5" fill="#E0991C" />
      <rect x="153" y="64" width="18" height="12" rx="3" fill="#FFF1CE" />
      <rect x="44" y="74" width="152" height="122" rx="26" fill={`url(#${gY})`} />
      <ellipse cx="70" cy="108" rx="9" ry="8" fill={`url(#${gHole})`} />
      <ellipse cx="170" cy="118" rx="8" ry="8" fill={`url(#${gHole})`} />
      <ellipse cx="74" cy="170" rx="7" ry="7" fill={`url(#${gHole})`} />
      <ellipse cx="166" cy="172" rx="9" ry="8" fill={`url(#${gHole})`} />
      <circle cx="120" cy="136" r="34" fill="#FFF4D6" />
      <circle cx="120" cy="136" r="27" fill="#D99421" />
      <circle cx="120" cy="136" r="21" fill={`url(#${gGlass})`} />
      <ellipse cx="111" cy="126" rx="9" ry="6" fill="#ffffff" opacity="0.4" />
    </svg>
  )
}
