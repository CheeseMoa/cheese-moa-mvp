/**
 * 모션 토큰(CHMO-711) — 앱 전체 전환의 시간·이징 단일 원천.
 *
 * 같은 값을 두 곳이 쓴다: CSS 쪽은 `tailwind.config.js`가 이 파일을 읽어
 * `duration-*`·`ease-*` 유틸과 오버레이 키프레임을 만들고, JS 쪽(진입 효과·라이트박스
 * 슬라이드처럼 인라인 style로 도는 모션)은 여기서 직접 가져다 쓴다.
 * 그래서 화면 코드에 ms·cubic-bezier 리터럴을 새로 적을 일이 없다.
 */

export const MOTION_DURATION = {
  /** 눌림 반응·색 전환 — 손끝에 즉시 붙어야 하는 구간 */
  fast: 120,
  /** 오버레이 등장·시트 되돌림 — 화면에 무언가 나타나는 구간 */
  base: 200,
  /** 진입 효과·사진 슬라이드 — 거리가 있는 이동 */
  slow: 280,
} as const

export const MOTION_EASE = {
  /** 기본 — 빠르게 출발해 부드럽게 안착(등장·이동) */
  standard: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** 팝 — 살짝 넘쳤다 제자리로(카드 등장·다이얼로그) */
  pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** 퇴장 — 느리게 떠나 빠르게 사라짐(닫힘 전용) */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const

/**
 * 모션을 줄여 달라고 설정한 사용자인지. 전역 CSS(`index.css`)가 전환·애니메이션을 이미
 * 걷어내지만, JS로 도는 모션은 "재생하지 않는다"를 스스로 판단해야 한다(0ms로 도는 것과
 * 아예 건너뛰는 것은 타이머·정리 코드가 달라진다).
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
