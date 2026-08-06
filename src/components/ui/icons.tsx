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

/** 공유 — 위 화살표 + 받침 트레이(square.and.arrow.up) — 초대/학부모 공유 시트 */
export function IconShare({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 14V4" />
      <path d="M8.5 7.5L12 4l3.5 3.5" />
      <path d="M5 11v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
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

/** 체크 — 02-2 동의 체크박스(CHMO-445). 소형(14px) 렌더가 기본이라 세트 표준(1.8)보다 굵게 */
export function IconCheck({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** 추가 — 플러스(iOS '새 앨범'과 같은 문법) — 09-1 이동 시트 "새 앨범" 타일(CHMO-435) */
export function IconPlus({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/**
 * 일반 모임 — 사람 둘(person.2). 03 유형 선택 카드(CHMO-603 후속 디자인 개선).
 * 앞사람은 머리+어깨를 다 그리고 뒷사람은 옆으로 반만 걸치게 둔다 — 26px 렌더에서
 * 둘을 온전히 그리면 획이 겹쳐 뭉갠다.
 */
export function IconPeople({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="9.6" cy="8.4" r="3.4" />
      <path d="M3.4 19.4c0-3.2 2.8-5.2 6.2-5.2s6.2 2 6.2 5.2" />
      <path d="M16.2 5.6a3.4 3.4 0 0 1 0 5.7" />
      <path d="M18 14.6c1.7.7 2.6 2.4 2.6 4.4" />
    </svg>
  )
}

/**
 * 비즈니스 모임 — 본관+별관 건물(building.2). 03 유형 선택 카드.
 * 창은 2×2로만 둔다: 26px에서 1.8 스트로크 짧은 획을 더 넣으면 점 무더기가 된다.
 */
export function IconBuilding({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 20.4V5.4A1.4 1.4 0 0 1 5.4 4h7.2A1.4 1.4 0 0 1 14 5.4v15" />
      <path d="M14 10.2h4.6A1.4 1.4 0 0 1 20 11.6v8.8" />
      <path d="M2.9 20.4h18.2" />
      <path d="M7.4 7.9h1.3M11.3 7.9h1.3M7.4 11.9h1.3M11.3 11.9h1.3" />
      <path d="M17 14.6h1.3" />
      <path d="M8.2 20.4v-3.6h3.6v3.6" />
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
