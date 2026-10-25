# NueNews as one container: the API, the scheduler and the built web app, on port 3000.
#
#   docker build -t nuenews \
#     --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=<publishable or anon key> .
#
# The two VITE_ values are public and are baked into the web app, so they are build arguments.
# Everything else (DATABASE_URL, SUPABASE_URL, ...) is read when the container starts. See
# deploy/compose.yaml and docs/DEPLOYMENT-HOMESERVER.md.

# ---- Build the web app ----------------------------------------------------------------------
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app

# Manifests first, so the dependency layer is reused until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts: better-sqlite3 (only used by the one-off SQLite importer) would need a C++
# toolchain, which this image does not have. esbuild and the rest work without install scripts.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN pnpm --filter @nuenews/web build

# ---- Run it ---------------------------------------------------------------------------------
FROM node:24-slim AS runtime
RUN corepack enable
WORKDIR /app

# Only what the API needs at run time. The API runs its TypeScript through tsx, so there is no
# separate compile step, and the web app is just the static files from the build stage.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --ignore-scripts --prod --filter "@nuenews/api..."

COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY packages/shared/src packages/shared/src
COPY --from=build /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

USER node
WORKDIR /app/apps/api

# A sleeping or broken API shows up as "unhealthy" in `docker ps`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# node itself is PID 1 (no pnpm or tsx wrapper), so `docker stop` reaches the shutdown handler.
CMD ["node", "--import", "tsx", "src/index.ts"]
