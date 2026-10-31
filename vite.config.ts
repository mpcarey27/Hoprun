import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api/strava': {
        target: 'https://www.strava.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/strava/, ''),
      },
      '/api/gsheets': {
        target: 'https://docs.google.com/spreadsheets',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/gsheets/, ''),
      },
    },
  },
})
