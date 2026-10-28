import { defineConfig } from 'vite';

export default defineConfig(async ({ command, mode }) => ({
  base: './',
  plugins: command === 'serve' && mode === 'toss'
    ? [(await import('@apps-in-toss/devtools/unplugin')).default.vite()]
    : [],
  server: { port: 5173, strictPort: true },
}));
