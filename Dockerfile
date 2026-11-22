# syntax=docker/dockerfile:1
# One image definition, three targets: web, worker, migrate.
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
RUN npm ci

FROM deps AS source
COPY . .
RUN npm run db:generate

FROM source AS web-build
# Placeholders: nothing connects at build time, but modules read these on import.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-0000000000 \
    MAILCLOCK_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    NEXT_TELEMETRY_DISABLED=1 \
    npm run build --workspace @mailclock/web

FROM source AS migrate
USER node
CMD ["npm", "run", "db:deploy"]

FROM source AS worker
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "start", "--workspace", "@mailclock/worker"]

FROM web-build AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["npm", "run", "start", "--workspace", "@mailclock/web"]
