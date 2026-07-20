import type { ReactNode } from 'react'

interface PhoneShellProps {
  children: ReactNode
}

/**
 * 모바일웹 기준 프레임(390 × 844). 데스크톱에서는 가운데 정렬된 폰 프레임으로,
 * 모바일에서는 화면 전체로 렌더한다.
 */
export function PhoneShell({ children }: PhoneShellProps) {
  return (
    <div className="cheese-dots flex min-h-screen w-full justify-center bg-surface">
      {/* overflow-clip(≠hidden): 라운드 코너 밖만 자르고 스크롤 컨테이너를 만들지 않는다 —
          hidden이면 sticky(06-U 상단 토글·하단 CTA)가 데스크톱 프레임에서 뷰포트에 안 붙는다 */}
      <div className="relative flex min-h-screen w-full max-w-phone flex-col bg-cream shadow-card sm:my-6 sm:min-h-[844px] sm:overflow-clip sm:rounded-4xl">
        {children}
      </div>
    </div>
  )
}
