import { useLayoutEffect, useRef } from 'react'

/** 진입 효과 프리셋 — 시작 transform과 타이밍만 다르고 재생 방식(FLIP 되감기)은 같다 */
const PRESETS = {
  // 08 앨범 그리드: 제자리 팝(작게 → 살짝 넘침 → 안착). y>1 백-아웃 이징이 팝 느낌을 만든다
  pop: { from: 'scale(0.85)', duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', stagger: 30 },
  // 05 이벤트 목록: 라이즈(아래에서 떠오름) — 세로 목록은 스크롤과 같은 축의 이동이 자연스럽다
  rise: { from: 'translateY(18px)', duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', stagger: 45 },
} as const

export type EntrancePreset = keyof typeof PRESETS

/**
 * 목록/그리드 진입 효과(CHMO-708 도입 → 709에서 공용 승격) — 반환한 ref를 컨테이너에 걸면
 * 직계 자식들이 시작 상태에서 순차(stagger)로 제 상태를 찾아간다. 최종 레이아웃을 인라인
 * transform으로 되감았다 푸는 것뿐이라 배치 자체는 CSS 그대로다.
 * 마운트당 1회 — refetch·갱신마다 다시 재생되면 효과가 아니라 소음이다(재진입은 재생).
 * 끝나면 인라인 transition을 걷는다(남기면 자식의 눌림 전환(active:scale)이 이 전환을 탄다).
 * prefers-reduced-motion이면 건너뛴다.
 */
export function useEntrance<T extends HTMLElement>(ready: boolean, preset: EntrancePreset) {
  const ref = useRef<T>(null)
  const playedRef = useRef(false)
  useLayoutEffect(() => {
    const container = ref.current
    if (!ready || playedRef.current || !container) return
    playedRef.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const { from, duration, easing, stagger } = PRESETS[preset]
    const cells = Array.from(container.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    )
    if (cells.length === 0) return
    cells.forEach((el) => {
      el.style.transition = 'none'
      el.style.transform = from
      el.style.opacity = '0'
    })
    // 시작 상태가 그려진 다음 프레임에 목표 상태로 — 같은 프레임에 쓰면 전환이 안 탄다
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cells.forEach((el, i) => {
          el.style.transition = `transform ${duration}ms ${easing} ${i * stagger}ms, opacity 160ms ease-out ${i * stagger}ms`
          el.style.transform = ''
          el.style.opacity = ''
        })
      }),
    )
    // 정리는 setTimeout 완주에 맡긴다(cleanup으로 끊으면 StrictMode 이중 실행에서 인라인
    // transition이 영영 남는다) — 언마운트 뒤 실행돼도 떨어져 나간 노드라 무해하다
    window.setTimeout(
      () => cells.forEach((el) => (el.style.transition = '')),
      duration + cells.length * stagger + 100,
    )
  }, [ready, preset])
  return ref
}
