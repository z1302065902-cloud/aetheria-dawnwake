import { defineConfig } from 'vite';

// base: './' -> required so the build works from a sub-path (itch.io / GitHub Pages).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: process.env.VITE_SOURCEMAP === '1',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
