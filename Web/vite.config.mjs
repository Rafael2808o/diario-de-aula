import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  cacheDir: '.vite-cache',
  server: {
    proxy: {
      '/api/v1': 'http://127.0.0.1:3333'
    }
  }
});
