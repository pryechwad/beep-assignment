# One image, three process roles (api | worker | scheduler) selected by the command.
# Build from the repository root:  docker build -f infrastructure/docker/Dockerfile -t beep-backend .

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN npm ci --no-audit --no-fund
COPY apps/api apps/api
COPY apps/worker apps/worker
# node_modules is kept whole: the runtime needs the Prisma CLI (migrate deploy) and the generated client.
RUN npx prisma generate --schema packages/database/prisma/schema.prisma \
 && npm run build -w @beep/api \
 && npm run build -w @beep/worker

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/* \
 && groupadd -r beep && useradd -r -g beep beep
ENV NODE_ENV=production CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/package.json ./package.json
USER beep
EXPOSE 4100
ENTRYPOINT ["/usr/bin/tini", "--"]
# Default role: API. Override with ["node","apps/worker/dist/worker.js"] or [".../scheduler.js"].
CMD ["node", "--enable-source-maps", "apps/api/dist/server.js"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1
