/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 치즈모아 디자인 토큰 (docs/screen-spec.md §1 팔레트 + 확장)
      colors: {
        primary: '#FFC93C', // 치즈 옐로우 — 주요 버튼/강조(크기 무관 동일 색)
        accent: '#8C5A2B', // 갈색 — 검토완료 테두리/보조 강조
        warn: '#E4572E', // 경고/위험(삭제 등)
        cream: '#FFFDF5', // 페이지 배경(--color-bg)
        surface: '#F3F0E9', // 카드/입력 표면
        text: '#3A3128', // 본문 텍스트
        heading: '#4A3415', // Jua 헤딩/로고 워드마크(딥 브라운) — docs/design/screen-system.dc.html
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
      },
      fontFamily: {
        // 서체는 Jua 한 벌(CHMO-513) — 로고 워드마크와 본문이 같은 얼굴을 쓴다.
        // `display` 토큰은 폐지했다: sans와 같아져 구분이 거짓이 된다(font-display 사용처도 제거).
        //
        // ⚠ Jua는 굵기가 400 하나뿐이다 — `font-bold`는 시각 효과가 없다(index.css가 합성 볼드를
        // 차단한다. 안 막으면 브라우저가 가짜 굵기를 만들어 획이 뭉갠다). 굵기 유틸은 의미 표시로
        // 남기되, **화면의 위계는 크기와 색이 만든다**: 같은 크기·같은 색을 굵기로만 갈라놨던
        // 자리는 크기·자간·색으로 다시 벌려 놨다(섹션 라벨 12px+자간 등).
        sans: ['Jua', 'system-ui', 'sans-serif'],
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
        'chase-scurry': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        // 진행률 없는 동안(인디터미넌트) 쥐가 트랙 위를 왕복 — left만 움직여 translate와 안 겹침
        'chase-roam': {
          '0%': { left: '4%' },
          '100%': { left: '96%' },
        },
        // 치즈모아 둘러보기(CHMO-504) 단계 전환 — 아래에서 살짝 올라오며 나타난다
        'step-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // 탭 지점 인디케이터 — 카드 전체를 감싸는 점멸 링(낡은 핫스팟 패턴) 대신 작은 물결 하나
        'tap-ripple': {
          '0%': { transform: 'scale(0.6)', opacity: '0.5' },
          '75%, 100%': { transform: 'scale(1.9)', opacity: '0' },
        },
      },
      animation: {
        'chase-scurry': 'chase-scurry 0.45s ease-in-out infinite',
        'chase-roam': 'chase-roam 1.8s ease-in-out infinite alternate',
        'step-in': 'step-in 0.3s ease-out both',
        'tap-ripple': 'tap-ripple 1.8s ease-out infinite',
      },
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
