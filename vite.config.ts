import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // MSW를 끈 개발(VITE_ENABLE_MSW=false)에서 /api/v1 요청을 실 BE로 전달(CORS 회피).
      // 실 BE 경로에는 /api/v1 프리픽스가 없어(스웨거 확인) 벗겨서 전달한다. (CHMO-191)
      proxy: {
        '/api/v1': {
          target: env.VITE_API_ORIGIN || 'https://api.cheese-moa.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/v1/, ''),
          // 브라우저가 POST 등 비-GET 요청에 자동으로 붙이는 Origin(http://localhost:5173)을 벗긴다.
          // 프록시(서버↔서버) 구간엔 CORS가 무의미한데, BE(Spring) CORS 허용목록에 localhost가 없어
          // 이 Origin이 그대로 가면 403 "Invalid CORS request"가 난다. Origin을 지우면 BE가 비-CORS
          // 요청으로 처리한다 — 데이터 보호는 토큰 인증(401)이 담당하고 CORS는 서버 자물쇠가 아니다.
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin')
            })
          },
        },
      },
    },
  }
})
