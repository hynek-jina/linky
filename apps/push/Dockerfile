# pnpm installs dependencies; Bun stays as the service runtime (Bun.serve,
# bun:sqlite) and as the bundler, so the build stage carries both.
FROM node:22-slim AS build

WORKDIR /app

RUN npm install -g pnpm@11.20.0 bun@1.3.9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/native-shell/package.json apps/native-shell/package.json
COPY apps/push/package.json apps/push/package.json
COPY apps/site/package.json apps/site/package.json
COPY apps/web-app/package.json apps/web-app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/config/package.json packages/config/package.json

RUN pnpm install --frozen-lockfile

COPY apps/push apps/push

RUN pnpm --filter @linky/push build

FROM oven/bun:1.3.9-alpine AS runtime

WORKDIR /app

RUN mkdir -p /data && chown bun:bun /data

COPY --from=build /app/apps/push/dist/index.js /app/index.js

ARG GIT_COMMIT_SHA=unknown

ENV NODE_ENV=production
ENV PUSH_PORT=8787
ENV PUSH_STORAGE_PATH=/data/linky-push.sqlite
ENV BUILD_COMMIT_SHA=${GIT_COMMIT_SHA}

USER bun

EXPOSE 8787

VOLUME ["/data"]

CMD ["bun", "/app/index.js"]
