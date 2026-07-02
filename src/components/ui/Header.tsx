import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Cheddar } from './Cheddar'

interface HeaderProps {
  /** 현재 화면 타이틀. 홈형에서 생략하면 워드마크 '치즈모아' */
  title?: string
  /** 뒤로가기 목적지 — 지정하면 서브형(‹ 라벨 + 중앙 타이틀), 없으면 홈형(체다 로고) */
  backTo?: string
  /** 뒤로가기 라벨(상위 화면명, 예: '이벤트 상세') */
  backLabel?: string
  /** 우측 액션 슬롯(설정 ⚙ 등) */
  right?: ReactNode
}

/**
 * 화면 상단 헤더 (dc.html §01).
 * 홈형 = 체다 로고 + 워드마크 + 우측 슬롯 · 서브형 = 뒤로가기(accent) + 중앙 타이틀 + 우측 슬롯.
 */
export function Header({ title, backTo, backLabel, right }: HeaderProps) {
  if (backTo) {
    return (
      <header className="grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-cream px-3.5">
        <Link
          to={backTo}
          className="justify-self-start truncate text-[15px] font-medium text-accent"
        >
          ‹ {backLabel ?? '뒤로'}
        </Link>
        <h1 className="truncate text-base font-bold text-text">{title}</h1>
        <div className="justify-self-end">{right}</div>
      </header>
    )
  }
  return (
    <header className="flex h-[52px] shrink-0 items-center border-b border-border bg-cream px-3.5">
      <Cheddar size={30} />
      <span className="ml-2 font-display text-xl text-heading">{title ?? '치즈모아'}</span>
      <div className="ml-auto">{right}</div>
    </header>
  )
}
