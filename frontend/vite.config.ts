import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Stylesheets stay disabled in tests, except `?raw` imports that pin CSS rules as text.
    css: { include: [/\.css\?raw$/] },
    // Node 25+ defines its own global localStorage (undefined without --localstorage-file), which
    // hides the jsdom one; switching it off gives the tests the jsdom Storage.
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
  },
});
