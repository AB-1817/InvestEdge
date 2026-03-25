import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/InvestEdge/',   // Required for GitHub Pages
  plugins: [react()],
  server: {
    port: 5173,
    cors: true,
  }
})
