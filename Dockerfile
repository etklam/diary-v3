# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY openapi ./openapi
COPY tsconfig.json drizzle.config.ts eslint.config.js ./
COPY .env.example ./

RUN npm run build:artifacts
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3101 \
    MIGRATIONS_FOLDER=/app/packages/db/migrations
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist/api ./dist/api
COPY --from=build /app/packages/db/migrations ./packages/db/migrations
USER node
EXPOSE 3101
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD node -e "fetch('http://127.0.0.1:3101/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/api/server.js"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web/build ./apps/web/build
USER node
EXPOSE 3000
# react-router-serve resolves the build's relative "build/client" assets dir
# against the process CWD, so the web stage must run from apps/web.
WORKDIR /app/apps/web
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "../../node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"]
