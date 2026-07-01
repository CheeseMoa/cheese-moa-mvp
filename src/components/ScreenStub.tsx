import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PhoneShell } from './PhoneShell'

interface ScreenStubProps {
  /** 화면 코드 (screen-spec 매핑, 예: '02') */
  code: string
  title: string
  /** Figma 노드 id (있으면 표기) */
  node?: string
  subtitle?: string
  children?: ReactNode
}

/**
 * 스캐폴딩용 화면 스텁. 각 화면은 후속 스토리에서 실제 UI로 대체된다.
 * 지금은 헤더(코드·제목)와 네비게이션 링크만으로 전 라우트 이동을 검증한다.
 */
export function ScreenStub({ code, title, node, subtitle, children }: ScreenStubProps) {
  return (
    <PhoneShell>
      <header className="border-b border-border bg-gradient-primary px-5 pb-4 pt-6">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-text/60">
          {code}
          {node ? ` · ${node}` : ''}
        </p>
        <h1 className="font-display text-2xl text-text">{title}</h1>
        {subtitle ? <p className="mt-1 font-sans text-sm text-text/70">{subtitle}</p> : null}
      </header>
      <main className="flex flex-1 flex-col gap-2 p-5">{children}</main>
    </PhoneShell>
  )
}

/** 스텁 네비게이션 링크 */
export function StubLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border bg-surface px-4 py-3 font-sans text-sm text-text transition hover:border-accent hover:bg-cream"
    >
      {children}
    </Link>
  )
}

/** 스텁 주요 액션 버튼 */
export function StubButton({
  onClick,
  children,
  variant = 'primary',
}: {
  onClick: () => void
  children: ReactNode
  variant?: 'primary' | 'ghost'
}) {
  const base =
    'rounded-2xl px-4 py-3 text-center font-display text-base transition active:scale-[0.99]'
  const styles =
    variant === 'primary'
      ? 'bg-gradient-cheddar text-text shadow-card'
      : 'border border-border bg-cream text-text'
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}
