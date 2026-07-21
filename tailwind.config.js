/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 치즈모아 디자인 토큰 (docs/screen-spec.md §1 팔레트 + 확장)
      colors: {
        primary: '#F5B82E', // 치즈 옐로우 — 주요 버튼/강조
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
        // Jua = 디스플레이(로고/헤딩), Gothic A1 = 본문
        display: ['Jua', 'system-ui', 'sans-serif'],
        sans: ['"Gothic A1"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-cheddar': 'linear-gradient(135deg, #F7C948 0%, #F5B82E 50%, #E8890C 100%)',
        'gradient-primary': 'linear-gradient(135deg, #FFE7A3 0%, #FBD46A 100%)',
        // 치즈 심볼(Cheddar) 타일 배경 — 노란 심볼이 노란 타일에 묻히지 않게 딥 브라운으로 대비(CHMO-351)
        'gradient-emblem': 'linear-gradient(135deg, #6B4B20 0%, #4A3415 55%, #35240D 100%)',
      },
      boxShadow: {
        card: '0 8px 30px rgba(58, 49, 40, 0.12)',
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
      },
      animation: {
        'chase-scurry': 'chase-scurry 0.45s ease-in-out infinite',
        'chase-roam': 'chase-roam 1.8s ease-in-out infinite alternate',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      maxWidth: {
        phone: '390px',
      },
    },
  },
  plugins: [],
}
