import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ★★★★★ ここが、最後の、本当の修正点です ★★★★★
    // Renderのホスト名を許可する設定
    host: '0.0.0.0',
    hmr: {
      clientPort: 443,
      host: process.env.RENDER_EXTERNAL_URL?.substring(8),
    }
  },
})