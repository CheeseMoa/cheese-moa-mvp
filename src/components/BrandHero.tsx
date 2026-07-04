import { Cheddar } from './ui'

/**
 * 인증 화면(01·01-1·01-2) 공용 브랜드 블록 — 로고 + 워드마크 + 태그라인.
 * 와이어프레임(211:1343) 상단의 흰 배경 영역.
 */
export function BrandHero() {
  return (
    <section className="flex flex-col items-center bg-white px-6 pb-7 pt-9 text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-cheddar shadow-card">
        <Cheddar size={64} />
      </span>
      <h1 className="mt-4 font-display text-[32px] leading-tight text-heading">치즈모아</h1>
      <p className="mt-1 text-sm text-muted">사진 정리부터 공유까지 한 번에</p>
    </section>
  )
}
