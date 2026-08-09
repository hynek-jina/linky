# The service runs its TypeScript sources directly on Node's built-in type
# stripping, so there is no build step — just a pruned install.
FROM node:24-slim AS build

WORKDIR /app

RUN npm install -g pnpm@11.20.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/native-shell/package.json apps/native-shell/package.json
COPY apps/push/package.json apps/push/package.json
COPY apps/site/package.json apps/site/package.json
COPY apps/web-app/package.json apps/web-app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/config/package.json packages/config/package.json

RUN pnpm install --frozen-lockfile

COPY apps/push apps/push

# --legacy: no injected workspace packages here (production deps only, none
# of them workspace-local), which is what pnpm v10+ deploy otherwise requires.
RUN pnpm --filter @linky/push deploy --prod --legacy /srv/push

FROM node:24-slim AS runtime

WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY --from=build /srv/push /app

ARG GIT_COMMIT_SHA=unknown

ENV NODE_ENV=production
ENV PUSH_PORT=8787
ENV PUSH_STORAGE_PATH=/data/linky-push.sqlite
ENV BUILD_COMMIT_SHA=${GIT_COMMIT_SHA}

USER node

EXPOSE 8787

VOLUME ["/data"]

CMD ["node", "src/index.ts"]
