import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Cheddar } from './ui'
import { SiteFooter } from './SiteFooter'
import { cx } from '../lib/cx'

/**
 * 공개 웹 페이지 셸 (CHMO-899) — 요금 안내·약관·환불정책·결제 화면처럼 **데스크톱에서도 열리는**
 * 페이지용. PhoneShell(390 폰 프레임)은 앱 화면을 흉내 낸 틀이라 PC로 연 심사 담당자에게
 * 가운데 작은 폰이 떠 있는 꼴이 된다 — 여기는 문서 스크롤 그대로의 반응형 페이지다
 * (모바일은 전폭, 넓은 화면은 본문 폭만 제한).
 *
 * 하단에 사업자·고객센터 정보(SiteFooter)를 **항상** 그린다 — "모든 공개 페이지 하단에 동일하게"
 * (AC-6)를 셸이 보장해 페이지가 빠뜨릴 수 없게.
 *
 * @param width 본문 폭 — 'wide'(요금 안내 등 카드가 나란히 서는 페이지) / 'narrow'(문서·결제 폼)
 */
export function PublicPageShell({
  title,
  width = 'narrow',
  children,
}: {
  /** 상단 바 우측의 화면 이름(없으면 로고만) */
  title?: string
  width?: 'wide' | 'narrow'
  children: ReactNode
}) {
  const widthCls = width === 'wide' ? 'max-w-4xl' : 'max-w-2xl'
  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-border bg-cream/95">
        <div className={cx('mx-auto flex h-14 items-center justify-between px-4 sm:px-6', widthCls)}>
          <Link to="/pricing" className="flex items-center gap-2" aria-label="치즈모아 요금 안내">
            <Cheddar size={28} />
            <span className="translate-y-[2px] font-logo text-[20px] text-heading">치즈모아</span>
          </Link>
          {title ? <span className="truncate pl-3 text-[14px] text-muted">{title}</span> : null}
        </div>
      </header>
      <main className={cx('mx-auto w-full flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-10', widthCls)}>
        {children}
      </main>
      <div className={cx('mx-auto w-full px-4 pb-safe-9 sm:px-6', widthCls)}>
        <SiteFooter />
      </div>
    </div>
  )
}
