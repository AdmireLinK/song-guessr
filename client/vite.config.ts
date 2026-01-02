import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 默认目标后端地址。若你的后端运行在其他端口，请在 client/.env.local 中设置 VITE_BACKEND_URL
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:3001'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // API 代理
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('[Proxy Error] /api:', err.message)
            })
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('[Proxy] ->', req.method, req.url)
            })
          },
        },
        // WebSocket 代理 (socket.io)
        '/socket.io': {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
        // Namespace proxy for /game websocket namespace (helps some clients send upgrades to /game)
        '/game': {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
        // Admin 静态资源代理
        '/admin': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})
