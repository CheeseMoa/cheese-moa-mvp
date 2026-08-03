import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { hasSeenCoachHint, markCoachHintSeen } from '../../lib/onboarding'

interface CoachHintProps {
  /** 노출 기록 키(lib/onboarding) — 화면·지점마다 다르게, 계정당 이 id로 1회만 뜬다 */
  id: string
  /** 앵커 기준 위치 — absolute 배치 클래스는 호출부가 소유한다(앵커마다 놓일 자리가 달라서) */
  className?: string
  /** 꼬리가 가리키는 방향 — up이면 말풍선이 앵커 아래, down이면 위에 놓인 배치다 */
  arrow?: 'up' | 'down'
  /** 꼬리의 가로 자리 — 말풍선이 앵커보다 넓을 때 앵커 쪽 끝으로 붙인다(기본 left) */
  tail?: 'left' | 'right'
  children: ReactNode
}

/**
 * 코치 힌트 (CHMO-565) — 실제 화면의 낯선 지점에 계정당 1회 붙는 말풍선.
 *
 * 자동 투어(00-T)의 자리를 물려받은 안내 수단이다: 시뮬레이션 무대가 아니라 **지금 조작할
 * 실제 화면 위**에서, 그 기능을 처음 만나는 순간에만 말한다(NN/g — 코치마크가 유효한 유일한
 * 조건). 남용 방지가 곧 설계라 규칙을 좁게 고정한다:
 * - 화면당 1개 · 계정당 1회('뜰 때' 기록 — 새로고침 이탈로 1회 보장이 깨지지 않게)
 * - 딤·오버레이 없음, pointer-events도 없음 — 아래 카드·버튼 탭을 절대 막지 않는다
 * - 아무 곳이나 탭하면 사라진다(닫기 버튼 없음 — 닫는 법을 또 가르칠 이유가 없다)
 * - 닫혀도 화면이 스스로 설명돼야 한다는 전제의 **보조 수단**(툴팁 76%가 3초 내 닫힌다)
 *
 * 탭 감지가 pointerdown이 아니라 click인 이유: 터치 스크롤의 시작도 pointerdown이라
 * 목록을 훑어보기만 해도 힌트가 사라진다 — click은 스크롤로는 발화하지 않는다.
 */
export function CoachHint({ id, className, arrow = 'up', tail = 'left', children }: CoachHintProps) {
  const [visible, setVisible] = useState(() => !hasSeenCoachHint(id))

  useEffect(() => {
    if (visible) markCoachHintSeen(id)
  }, [visible, id])

  useEffect(() => {
    if (!visible) return
    const dismiss = () => setVisible(false)
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [visible])

  if (!visible) return null

  return (
    <div
      role="status"
      className={cx(
        'pointer-events-none absolute z-10 max-w-[240px] rounded-xl bg-heading px-3 py-2 text-xs leading-relaxed text-cream shadow-card-sm motion-safe:animate-step-in',
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute h-2.5 w-2.5 rotate-45 bg-heading',
          arrow === 'up' ? '-top-1' : '-bottom-1',
          tail === 'left' ? 'left-6' : 'right-6',
        )}
      />
      {children}
    </div>
  )
}
