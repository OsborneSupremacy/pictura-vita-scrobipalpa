import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The API is proxied rather than called cross-origin. That keeps the browser talking to a
 * single origin, so the API needs no CORS policy — nothing about this app should be
 * reachable from a page the user did not open themselves.
 */
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5199';

/**
 * Loopback by default, because this app is local-only. Overridable solely for the container,
 * where 127.0.0.1 is the container's own loopback and would answer nobody: there the dev
 * server binds all interfaces and Compose publishes the port on the host's loopback instead,
 * which is the same boundary drawn one layer out.
 */
const host = process.env.DEV_SERVER_HOST ?? '127.0.0.1';

/**
 * A bind mount delivers no inotify events on macOS or Windows, so a watcher inside a
 * container never hears about an edit made on the host. Polling is the only thing that
 * works there, and it costs enough CPU that it stays off everywhere else. Spread rather
 * than assigned, because the key has to be absent to get Vite's default watcher — an
 * explicit `watch: null` turns watching off altogether.
 */
const watch = process.env.DEV_SERVER_POLL === 'true'
  ? { watch: { usePolling: true, interval: 300 } }
  : {};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host,
    ...watch,
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
