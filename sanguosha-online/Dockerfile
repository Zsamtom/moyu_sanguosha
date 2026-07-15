FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG APP_VERSION=dev
ARG BUILD_SHA=
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    BUILD_SHA=${BUILD_SHA}
RUN corepack enable
COPY --chown=node:node --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/shared ./shared
COPY --chown=node:node --from=build /app/server ./server
COPY --chown=node:node --from=build /app/web/dist ./web/dist
USER node
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
