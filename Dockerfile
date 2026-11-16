# Multi-target Dockerfile for the monorepo. Build with --target server or --target web.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
COPY packages/minigames/package.json packages/minigames/
RUN pnpm install --frozen-lockfile

FROM deps AS source
COPY . .

# ---------------------------------------------------------------- game server
FROM source AS server
WORKDIR /app/apps/server
RUN pnpm exec prisma generate
ENV PORT=4000
EXPOSE 4000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx src/index.ts"]

# ---------------------------------------------------------------- web
FROM source AS web-build
ARG NEXT_PUBLIC_SERVER_URL=
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
WORKDIR /app/apps/web
RUN pnpm build

FROM web-build AS web
ENV PORT=3000
EXPOSE 3000
CMD ["pnpm", "start"]
