import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.spec.js'],
    restoreMocks: true,
    maxWorkers: 1,
  },
});
