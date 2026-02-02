import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/webdav': 'http://localhost:8000',
      '/jianguoyun-proxy': {
        target: 'https://dav.jianguoyun.com/dav/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jianguoyun-proxy/, '')
      }
    }
  }
})
