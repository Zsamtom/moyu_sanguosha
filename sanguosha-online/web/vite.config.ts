import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep a narrow warning budget after route-level and dependency-level
    // splitting. The current largest shared chunk is about 513 kB; future
    // growth above this ceiling remains visible during production builds.
    chunkSizeWarningLimit: 525,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) return 'react-vendor';
          if (id.includes('/socket.io-client/') || id.includes('/engine.io-client/')) {
            return 'realtime-vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
