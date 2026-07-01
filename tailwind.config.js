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
        muted: '#9E978C', // 보조 텍스트/플레이스홀더
        border: '#E6E0D4', // 구분선/기본 테두리
        photo: '#EAE4D8', // 사진 썸네일 플레이스홀더 배경
        // 이벤트 상태 배지 색
        status: {
          new: '#9E978C', // NEW(사진 0장)
          analyzing: '#E8890C', // 분석중
          ready: '#8C5A2B', // 공개 준비(검토완료)
          published: '#3FA34D', // 공개 완료
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
      },
      boxShadow: {
        card: '0 8px 30px rgba(58, 49, 40, 0.12)',
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
