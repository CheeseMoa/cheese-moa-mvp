/**
 * SF Symbols풍 라인 아이콘 세트 (CHMO-242) — 얇은 스트로크(1.8)·둥근 캡·둥근 조인,
 * 색은 currentColor(부모 텍스트 색·버튼 variant 색을 그대로 따른다). 인라인 SVG — 외부 라이브러리 없음.
 * 라이트박스 툴바에서 시작해 옮기기/삭제/저장(다운로드) 액션 버튼 공용으로 승격.
 */

interface IconProps {
  /** 정사각 픽셀 크기 — 툴바 24(기본) · 버튼 안 18 권장 */
  size?: number
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
}

/** 닫기 ✕ */
export function IconClose({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/** 저장/다운로드 — 아래 화살표 + 받침 트레이 */
export function IconDownload({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 4v10" />
      <path d="M8.5 10.5L12 14l3.5-3.5" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

/** 삭제 — 휴지통 */
export function IconTrash({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M18 7l-.8 12.1a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7" />
    </svg>
  )
}

/** 이름 수정 — 연필(촉 왼쪽 아래·대각선 45°, 표준 편집 아이콘 방향) — 08 앨범 카드 이름 힌트(CHMO-400) */
export function IconPencil({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M16.7 4.1a2.05 2.05 0 0 1 2.9 2.9L8 18.6l-3.9 1 1-3.9z" />
      <path d="M14.8 6l2.9 2.9" />
    </svg>
  )
}

/** 옮기기 — 폴더 + 안쪽 오른 화살표 */
export function IconFolderMove({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M8.8 14.2h6" />
      <path d="M12.3 11.7l2.5 2.5-2.5 2.5" />
    </svg>
  )
}
