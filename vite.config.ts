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
          target: env.VITE_API_ORIGIN || 'http://3.35.177.22',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/v1/, ''),
        },
      },
    },
  }
})
