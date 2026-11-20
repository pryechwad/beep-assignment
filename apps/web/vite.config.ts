import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Inline (empty) PostCSS config: stops Vite searching parent folders and picking up an unrelated
  // postcss.config.js in the user's home directory. Tailwind v4 runs through its Vite plugin.
  css: { postcss: { plugins: [] } },
  server: {
    port: 5180,
    proxy: { '/api': { target: process.env.VITE_DEV_API_PROXY ?? 'http://localhost:4100', changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
