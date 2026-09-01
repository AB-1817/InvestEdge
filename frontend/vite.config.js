import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',   // Vercel deployment — must be '/'
  plugins: [react()],
  server: {
    port: 5173,
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
