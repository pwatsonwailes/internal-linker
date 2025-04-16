import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  worker: {
    format: 'es',
    plugins: [],
    resourceLimits: {
      maxOldGenerationSizeMb: 4096,
      maxYoungGenerationSizeMb: 512,
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'worker-deps': [
            '@supabase/supabase-js',
            './src/utils/bloomFilter',
            './src/utils/invertedIndex',
            './src/utils/minHash',
            './src/utils/prefixIndex',
            './src/utils/topicModeling'
          ]
        }
      }
    },
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true
  }
});