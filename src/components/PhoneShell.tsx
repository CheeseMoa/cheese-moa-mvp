import type { ReactNode } from 'react'

interface PhoneShellProps {
  children: ReactNode
}

/**
 * 모바일웹 기준 프레임(390 × 844). 데스크톱에서는 가운데 정렬된 폰 프레임으로,
 * 모바일에서는 화면 전체로 렌더한다.
 *
 * 셸은 보이는 뷰포트에 딱 맞는 고정 높이(h-dvh)다 — 문서 스크롤이 생기지 않아 주소창
 * 상태와 무관하게 하단 액션이 항상 보인다. 스크롤은 각 화면의 콘텐츠 영역(overflow-y-auto)이
 * 소유한다(CHMO-396). 100vh는 주소창이 숨겨진 큰 뷰포트 기준이라 쓰지 않는다.
 */
export function PhoneShell({ children }: PhoneShellProps) {
  return (
    <div className="cheese-dots flex min-h-dvh w-full justify-center bg-surface">
      {/* overflow-clip(≠hidden): 라운드 코너 밖만 자르고 스크롤 컨테이너를 만들지 않는다 —
          hidden이면 페이지 내 sticky(Modal·BottomSheet·라이트박스 앵커)가 셸 기준으로 갇힌다(CHMO-369) */}
      <div className="relative flex h-dvh w-full max-w-phone flex-col bg-cream shadow-card sm:my-6 sm:h-[844px] sm:overflow-clip sm:rounded-4xl">
        {children}
      </div>
    </div>
  )
}
