import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Changed from default 5173 to avoid conflicts
    strictPort: true,
  },
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        logger: {
          warn: (message, options) => {
            if (options.deprecation) return;
            console.warn(message);
          }
        }
      },
    },
  },
})
