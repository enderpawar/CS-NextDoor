import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Electron renderer는 file:// 프로토콜 → 상대 경로 필수
  base: mode === 'electron' ? './' : '/',
  build: {
    outDir: mode === 'electron' ? 'dist/renderer' : 'dist/pwa',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  define: {
    // 런타임 모드 구분용 환경변수
    __APP_MODE__: JSON.stringify(mode),
  },
}));
