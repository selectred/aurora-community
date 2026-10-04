import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Merge any chunk smaller than 4 KB into its importer to avoid
        // excessive HTTP requests from tiny per-icon splits
        experimentalMinChunkSize: 4096,
        manualChunks: {
          'chart-js': ['chart.js', 'vue-chartjs'],
          'vue-vendor': ['vue', 'vue-router', 'pinia']
          // lucide-vue-next intentionally NOT a manual chunk — each lazy route
          // bundles only the icons it uses; App.vue's sidebar icons go into
          // the main chunk, eliminating unused icon code on first load
        }
      }
    }
  }
})
