# The Vite dev server, not a production bundle. Running it here rather than serving a built
# dist/ behind a web server keeps one proxy configuration (vite.config.ts) instead of two,
# and keeps hot reload working against the bind-mounted source.

FROM node:24-alpine
WORKDIR /app

# The lockfile alone first, so the install layer survives a source edit. It records the
# platform-specific rollup and esbuild binaries for every target, so `npm ci` picks the Linux
# ones here even though the lockfile was written on a Mac.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 127.0.0.1 inside a container answers only itself; the dev server has to bind the container's
# own interfaces to be reachable at all. The local-only boundary moves to Compose, which
# publishes the port on the host's loopback.
ENV DEV_SERVER_HOST=0.0.0.0

# Bind mounts do not deliver inotify events on macOS or Windows, so without polling an edit
# on the host never reaches the watcher and nothing reloads.
ENV DEV_SERVER_POLL=true

EXPOSE 5173
CMD ["npm", "run", "dev"]
