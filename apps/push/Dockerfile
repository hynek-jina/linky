FROM oven/bun:1.3.9-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/push/package.json apps/push/package.json
COPY apps/web-app/package.json apps/web-app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/config/package.json packages/config/package.json

RUN bun install --frozen-lockfile

COPY apps/push apps/push

RUN bun run --filter @linky/push build

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
