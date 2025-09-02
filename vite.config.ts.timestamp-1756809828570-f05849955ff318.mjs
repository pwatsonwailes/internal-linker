// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["lucide-react"]
  },
  worker: {
    format: "es",
    plugins: [],
    resourceLimits: {
      maxOldGenerationSizeMb: 4096,
      maxYoungGenerationSizeMb: 512
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "worker-deps": [
            "@supabase/supabase-js",
            "./src/utils/bloomFilter",
            "./src/utils/invertedIndex",
            "./src/utils/minHash",
            "./src/utils/prefixIndex",
            "./src/utils/topicModeling"
          ]
        }
      }
    },
    target: "esnext",
    minify: "esbuild",
    sourcemap: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcbiAgfSxcbiAgd29ya2VyOiB7XG4gICAgZm9ybWF0OiAnZXMnLFxuICAgIHBsdWdpbnM6IFtdLFxuICAgIHJlc291cmNlTGltaXRzOiB7XG4gICAgICBtYXhPbGRHZW5lcmF0aW9uU2l6ZU1iOiA0MDk2LFxuICAgICAgbWF4WW91bmdHZW5lcmF0aW9uU2l6ZU1iOiA1MTIsXG4gICAgfVxuICB9LFxuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICAnd29ya2VyLWRlcHMnOiBbXG4gICAgICAgICAgICAnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJyxcbiAgICAgICAgICAgICcuL3NyYy91dGlscy9ibG9vbUZpbHRlcicsXG4gICAgICAgICAgICAnLi9zcmMvdXRpbHMvaW52ZXJ0ZWRJbmRleCcsXG4gICAgICAgICAgICAnLi9zcmMvdXRpbHMvbWluSGFzaCcsXG4gICAgICAgICAgICAnLi9zcmMvdXRpbHMvcHJlZml4SW5kZXgnLFxuICAgICAgICAgICAgJy4vc3JjL3V0aWxzL3RvcGljTW9kZWxpbmcnXG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICB0YXJnZXQ6ICdlc25leHQnLFxuICAgIG1pbmlmeTogJ2VzYnVpbGQnLFxuICAgIHNvdXJjZW1hcDogdHJ1ZVxuICB9XG59KTsiXSwKICAibWFwcGluZ3MiOiAiO0FBQXlOLFNBQVMsb0JBQW9CO0FBQ3RQLE9BQU8sV0FBVztBQUVsQixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLGNBQWM7QUFBQSxFQUMxQjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sUUFBUTtBQUFBLElBQ1IsU0FBUyxDQUFDO0FBQUEsSUFDVixnQkFBZ0I7QUFBQSxNQUNkLHdCQUF3QjtBQUFBLE1BQ3hCLDBCQUEwQjtBQUFBLElBQzVCO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sY0FBYztBQUFBLFVBQ1osZUFBZTtBQUFBLFlBQ2I7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxFQUNiO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
