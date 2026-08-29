import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The API is proxied rather than called cross-origin. That keeps the browser talking to a
 * single origin, so the API needs no CORS policy — nothing about this app should be
 * reachable from a page the user did not open themselves.
 */
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5199';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bound to the loopback interface: this app is local-only by design.
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
        configure: proxy => {
          // Without this, an unreachable API surfaces as a bare 500 with an empty body,
          // which reads as "the API failed" when it actually means "the API is not running".
          proxy.on('error', (error, _request, response) => {
            if (!('writeHead' in response) || response.headersSent) return;
            response.writeHead(502, { 'Content-Type': 'application/json' });
            response.end(
              JSON.stringify({ error: 'api-unreachable', target: apiOrigin, detail: error.message })
            );
          });
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
