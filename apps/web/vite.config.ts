import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import { apiProxy } from './proxy';

export default defineConfig({
  plugins: [reactRouter()],
  server: { proxy: apiProxy(process.env.API_ORIGIN ?? 'http://127.0.0.1:3101') },
});
