import { MOTION_DURATION, MOTION_EASE } from './src/lib/motion'

/**
 * 모션 토큰은 `src/lib/motion.ts`가 단일 원천이다(CHMO-711) — JS로 도는 모션(진입 효과·
 * 라이트박스 슬라이드)과 CSS 유틸이 같은 값을 써야 해서, 여기서 값을 다시 적지 않고 읽어 온다.
 */
const duration = Object.fromEntries(
  Object.entries(MOTION_DURATION).map(([name, ms]) => [name, `${ms}ms`]),
)

/**
 * 오버레이 등장/퇴장 애니메이션 한 줄 만들기 — 이름만 다르고 조립은 같다.
 * fill-mode가 갈리는 게 핵심이다: 등장은 `backwards`(끝난 뒤 값을 붙들지 않는다),
 * 퇴장은 `forwards`(언마운트될 때까지 사라진 상태로 남는다).
 * 등장에 `both`를 쓰면 애니메이션이 끝난 뒤에도 transform을 계속 소유해서, 인라인 style로
 * 도는 모션(시트 끌어내리기)이 애니메이션에 밀려 아예 먹히지 않는다.
 */
const motion = (name, ms, ease, fill) => `${name} ${ms}ms ${ease} ${fill}`
const enter = (name, ms, ease) => motion(name, ms, ease, 'backwards')
const leave = (name, ms, ease) => motion(name, ms, ease, 'forwards')

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 치즈모아 디자인 토큰 (docs/screen-spec.md §1 팔레트 + 확장)
      colors: {
        primary: '#FFC93C', // 치즈 옐로우 — 주요 버튼/강조(크기 무관 동일 색)
        // 갈색 — 하단 CTA 면/검토완료 테두리/보조 강조. #8C5A2B에서 한 단계 밝힌 값이다.
        // 흰 글자 대비 4.72:1로 AA(4.5) 위 — 더 밝히면 #A26D3D(4.38)부터 흰 글자가 깨진다.
        accent: '#9C6835',
        warn: '#E4572E', // 경고/위험(삭제 등)
        cream: '#FFFDF5', // 페이지 배경(--color-bg)
        surface: '#F3F0E9', // 카드/입력 표면
        text: '#3A3128', // 본문 텍스트
        heading: '#4A3415', // 헤딩/로고 워드마크(딥 브라운) — docs/design/screen-system.dc.html
        muted: '#9E978C', // 보조 텍스트/플레이스홀더
        border: '#E6E0D4', // 구분선/기본 테두리
        photo: '#EAE4D8', // 사진 썸네일 플레이스홀더 배경
        // 이벤트 상태 배지 색 — 키는 EventStatus(src/types/api.ts)와 1:1 매칭
        status: {
          empty: '#9E978C', // empty: 사진 0장(NEW 배지)
          analyzing: '#E8890C', // analyzing: 분석중
          // TODO(스펙 확정 필요): 'review'(검수중) 배지 색 미정 — screen-spec에 배지 정의 없음
          ready: '#8C5A2B', // ready: 공개 준비(검토완료)
          published: '#3FA34D', // published: 공개 완료
        },
        // 관리자(어드민) 전용 팔레트(docs/admin-spec.md §3-0, CHMO-379) — 정보 밀도 우선의
        // 중립 그레이 베이스. 모바일 cream/brown 토큰을 끌어 쓰지 않는다(이름공간 분리).
        // 포인트는 기존 primary(#FFC93C)·heading(#4A3415)을 그대로 쓴다.
        admin: {
          bg: '#F7F8FA', // 페이지 배경
          surface: '#FFFFFF', // 카드·사이드바·상단바
          border: '#E5E7EB', // 구분선·표 행 보더
          text: '#1F2328', // 본문
          muted: '#6B7280', // 보조 텍스트·표 헤더·숫자 셀
          nav: '#FEF6E3', // 활성 메뉴 배경(옅은 치즈)
          // 이벤트 상태 배지 — review는 서비스 쪽 색 미정이라 중립 회색 잠정(admin-spec §3-0)
          status: {
            empty: '#9E978C',
            analyzing: '#E8890C',
            review: '#6B7280',
            ready: '#8C5A2B',
            published: '#3FA34D',
          },
        },
      },
      fontFamily: {
        // 서체는 Pretendard Variable 한 벌(CHMO-702) — Jua 단일화(CHMO-513)를 B2C 리디자인
        // 방향으로 대체했다. 가변 굵기(45~920)라 `font-bold`가 실제 굵기로 렌더된다.
        //
        // Jua 시절 크기·자간·색으로 벌려 둔 위계(섹션 라벨 12px+자간 등)는 그대로 둔다 —
        // 굵기 축이 생겼다고 되돌릴 이유가 없고, 위계를 굵기로 다시 짜는 건 리디자인 본편 몫.
        sans: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
        // 워드마크 전용(CHMO-706) — 헤더 '치즈모아' 한 곳에만 쓴다. 본문에 번지면 CHMO-702가
        // 걷어낸 둥근 서체가 되살아나므로 사용처를 늘리지 않는다(Jua는 굵기 400 한 벌뿐).
        logo: ['Jua', 'system-ui', 'sans-serif'],
        // 어드민 전용 중립 서체(CHMO-379) — 표·숫자 위주 화면이라 Jua(둥근 단일 굵기)가 아니라
        // 시스템 산세리프를 쓴다(굵기 위계 사용 가능 — 시스템 서체는 실제 볼드 파일이 있어
        // font-synthesis 차단과 무관하다). 추가 폰트 요청 0건.
        admin: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Pretendard',
          'Segoe UI',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      // 그라데이션 토큰(gradient-cheddar/primary/emblem) 폐지 — UI 면은 전부 단색으로 칠한다.
      // 연한 옐로우(구 gradient-primary)는 되살리지 않는다: 음영이 없으면 cream 배경에 묻힌다.
      // 엠블럼 타일은 심볼 단독 배치가 대체한다.
      // (로고 심볼 Cheddar 내부의 SVG 그라데이션은 브랜드 자산이라 대상 아님)
      boxShadow: {
        card: '0 8px 30px rgba(58, 49, 40, 0.12)',
        // 소형(h36) 버튼용 — card는 h48 기준이라 blur 30이 작은 버튼에선 아래로 번진다.
        // 옐로우가 밝아 cream 배경과 명도차가 작으므로(1.5:1) 면을 띄워 경계를 만든다.
        'card-sm': '0 3px 10px rgba(58, 49, 40, 0.16)',
        // 목록에서 여러 장이 세로로 쌓이는 카드용(CHMO-532). card의 blur 30은 카드 사이 간격
        // (12~14px)보다 넓어서, 아래 카드의 그림자가 위 카드 밑면을 덮어 간격을 뿌옇게 채운다 —
        // 경계를 만들라고 넣은 장치가 경계를 지우는 셈이다. blur를 간격보다 좁게 줄이고 카드를
        // 띄우는 몫만 남긴다(경계 자체는 진한 테두리가 맡는다).
        'card-stack': '0 2px 8px rgba(58, 49, 40, 0.07)',
      },
      // AI 분석 진행률 — 쥐가 치즈를 쫓아가는 프로그레스(CHMO-287, 분석중 화면 전용)
      keyframes: {
        // 달리기 프레임(CHMO-710) — 6프레임 가로 스트립을 background-position으로 한 장씩 넘긴다.
        // 120%인 이유: 배경폭 600%에서 P%의 오프셋 = -5w×P/100 이라 steps(6)로 0→120%를 밟으면
        // 정확히 0, -w, …, -5w 여섯 자리가 나온다(프레임 폭 w를 몰라도 되는 퍼센트 트릭)
        'chase-frames': {
          from: { backgroundPositionX: '0%' },
          to: { backgroundPositionX: '120%' },
        },
        // 진행률 없는 동안(인디터미넌트) 왕복 — left만 움직인다(고양이 되감기 translateX(-71px)는
        // 래퍼의 정적 클래스 몫). 끝값 -48px = 쥐 폭만큼 빼서 오른쪽 끝에서 쥐가 무대에 남는다
        'chase-roam': {
          '0%': { left: '0%' },
          '100%': { left: 'calc(100% - 48px)' },
        },
        // 코치 힌트(CHMO-565) 등장 — 아래에서 살짝 올라오며 나타난다
        'step-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // 오버레이 전환(CHMO-711) — 스크림·다이얼로그·시트·토스트가 나타나고 사라지는 방식.
        // 등장과 퇴장을 따로 두는 건 이징이 반대라서다(등장은 부드럽게 안착, 퇴장은 빠르게 빠짐).
        'scrim-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scrim-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        // 다이얼로그는 제자리에서 팝 — 위치를 옮기면 어디서 왔는지 눈이 따라가야 한다
        'dialog-in': {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'dialog-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.97)' },
        },
        // 시트는 아래에서 올라오고 아래로 내려간다 — 끌어내려 닫는 제스처와 같은 축
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'sheet-out': { from: { transform: 'translateY(0)' }, to: { transform: 'translateY(100%)' } },
        // 토스트는 살짝 떠오른다(코치 힌트 step-in과 같은 결, 이동 거리만 짧다)
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-out': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(4px)' },
        },
      },
      animation: {
        'chase-frames': 'chase-frames 0.6s steps(6) infinite',
        'chase-roam': 'chase-roam 1.8s ease-in-out infinite alternate',
        'step-in': enter('step-in', MOTION_DURATION.slow, MOTION_EASE.standard),
        'scrim-in': enter('scrim-in', MOTION_DURATION.base, MOTION_EASE.standard),
        'scrim-out': leave('scrim-out', MOTION_DURATION.fast, MOTION_EASE.exit),
        'dialog-in': enter('dialog-in', MOTION_DURATION.base, MOTION_EASE.pop),
        'dialog-out': leave('dialog-out', MOTION_DURATION.fast, MOTION_EASE.exit),
        'sheet-in': enter('sheet-in', MOTION_DURATION.base, MOTION_EASE.standard),
        'sheet-out': leave('sheet-out', MOTION_DURATION.fast, MOTION_EASE.exit),
        'toast-in': enter('toast-in', MOTION_DURATION.base, MOTION_EASE.standard),
        'toast-out': leave('toast-out', MOTION_DURATION.fast, MOTION_EASE.exit),
      },
      transitionDuration: duration,
      transitionTimingFunction: MOTION_EASE,
      borderRadius: {
        '4xl': '2rem',
      },
      maxWidth: {
        phone: '390px',
      },
      // 하단 고정 요소(액션바·시트·툴바·토스트)용 safe-area 합성 간격 — 기존 간격 + 홈 인디케이터
      // 여백(env). 인셋이 없는 환경(데스크톱·안드로이드 버튼 내비)에선 기존 값과 동일(CHMO-396)
      spacing: {
        'safe-6': 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        'safe-7': 'calc(1.75rem + env(safe-area-inset-bottom, 0px))',
        'safe-9': 'calc(2.25rem + env(safe-area-inset-bottom, 0px))',
      },
    },
  },
  plugins: [],
}
