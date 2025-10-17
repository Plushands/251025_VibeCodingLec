import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/suggestions': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/analyze': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/stt': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/feedback': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
