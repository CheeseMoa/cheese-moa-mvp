import { Cheddar } from './ui'

/**
 * 인증 화면(01·01-1·01-2) 공용 브랜드 블록 — 로고 + 워드마크 + 태그라인.
 * 와이어프레임(211:1343) 상단의 흰 배경 영역.
 */
interface BrandHeroProps {
  /**
   * 심볼 탭 핸들러 — 심사용 숨김 로그인 진입(CHMO-572, 01 랜딩만 전달).
   * 일반 사용자 눈에 띄면 안 되는 진입점이라 버튼 시맨틱 없이 탭만 받는다.
   */
  onSymbolTap?: () => void
}

export function BrandHero({ onSymbolTap }: BrandHeroProps) {
  return (
    <section className="flex flex-col items-center bg-white px-6 pb-7 pt-9 text-center">
      {/* 심볼 뒤 갈색 타일은 폐지 — 배경과 떼어놓으려 깔았던 색면이 무거워서 심볼만 남긴다 */}
      {/* touch-manipulation: 연속 탭이 더블탭 줌으로 새지 않게 — 시각 변화는 없다 */}
      <span className="select-none touch-manipulation" onClick={onSymbolTap}>
        <Cheddar size={88} />
      </span>
      <h1 className="mt-4 text-[32px] leading-tight text-heading">치즈모아</h1>
      <p className="mt-1 text-sm text-muted">사진 정리부터 공유까지 한 번에</p>
    </section>
  )
}
