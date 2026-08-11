import { Cheddar } from './ui'

/**
 * 인증 화면(01·01-C·15 잠금·DEV 로그인) 공용 브랜드 블록 — 로고 + 워드마크 + 태그라인.
 * 와이어프레임(211:1343)의 흰 배경은 폐지(CHMO-597) — 랜딩 개편으로 세로 중앙에 오면서
 * 크림 배경 한가운데 전폭 흰 띠가 부유하는 카드처럼 읽혔다. 색면 걷어내기 선례(CHMO-512·530).
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
    <section className="flex flex-col items-center px-6 pb-7 pt-9 text-center">
      {/* 심볼 뒤 갈색 타일은 폐지 — 배경과 떼어놓으려 깔았던 색면이 무거워서 심볼만 남긴다 */}
      {/* touch-manipulation: 연속 탭이 더블탭 줌으로 새지 않게 — 시각 변화는 없다 */}
      <span className="select-none touch-manipulation" onClick={onSymbolTap}>
        <Cheddar size={88} />
      </span>
      <h1 className="mt-4 text-[32px] leading-tight text-heading">치즈모아</h1>
      {/* 서브카피 중립화(CHMO-608 · B2C 359:11) — 서비스 정의가 "유치원 도구"에서
          "모임 사진 자동 정리 일반 도구"로 바뀌었다(group-type-proposal §2) */}
      <p className="mt-1 text-sm text-muted">모임 사진을 올리면, 사람별로 자동 정리</p>
    </section>
  )
}
