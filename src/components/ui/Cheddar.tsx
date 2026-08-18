import albumUrl from '../../assets/brand/album.png'

interface CheddarProps {
  /** 렌더 크기(px, 정사각) */
  size?: number
  className?: string
}

/**
 * 체다 — 헤더/엠블럼용 브랜드 심볼(치즈 앨범, CHMO-702).
 * 자산은 앱 리포(CheeseMoa-App assets/brand/album_512.png)와 동일 계열이라 웹·앱 아이콘이
 * 같은 얼굴을 쓴다. 종전 치즈 카메라 SVG(logo-v3-02 계열)는 이 교체로 폐기.
 * 컴포넌트 이름 Cheddar는 내부 식별자라 유지한다(사용처 9곳 무변경 — ADR 021 관례).
 */
export function Cheddar({ size = 30, className }: CheddarProps) {
  return (
    <img
      src={albumUrl}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
