# ─── Stage 1: Builder ────────────────────────────────────────────────────────
# Installs ALL deps, generates Prisma client, compiles TypeScript.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# `--legacy-peer-deps` mirrors the local `npm install` flag we used to
# add @nestjs/event-emitter under NestJS 11 — without it `npm ci` will
# refuse to install on a lockfile that resolved peer conflicts via
# the legacy strategy.
RUN npm ci --legacy-peer-deps

# Prisma config + schema must exist before generate
COPY prisma.config.ts ./
COPY prisma ./prisma/
# DATABASE_URL dummy: prisma generate only needs schema, not a live DB
RUN DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate

# CACHE_BUST invalidates COPY+build when source hash is unchanged but stale.
# Pass: docker compose build --build-arg CACHE_BUST=$(date +%s) backend
ARG CACHE_BUST=1
RUN echo "CACHE_BUST=$CACHE_BUST" > /tmp/cache-bust.txt

COPY . .
RUN npm run build

# ─── Stage 2: Production dependencies ────────────────────────────────────────
# Fresh install of production deps only — no TypeScript, @swc, jest, etc.
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# ─── Stage 3: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache \
    chromium \
    dumb-init \
    fontconfig \
    font-noto-arabic \
    ttf-dejavu

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create upload directories before switching user so the volume mount
# inherits correct ownership on first initialisation.
RUN mkdir -p /app/uploads/avatars && \
    chown -R nodejs:nodejs /app/uploads

# Production node_modules (no devDeps)
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
# Generated Prisma client (created in builder, not in prod-deps)
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
# Compiled application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
# Prisma schema + migrations needed for `prisma migrate deploy`
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma/
# Runtime assets used by generated documents, including optional PDF fonts.
COPY --from=builder --chown=nodejs:nodejs /app/assets ./assets/
# Prisma 7 requires prisma.config.ts in the working directory for migrate deploy.
# Prisma has a built-in TypeScript executor so the .ts source works directly.
COPY --from=builder --chown=nodejs:nodejs /app/prisma.config.ts ./prisma.config.ts

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
# Push schema changes (idempotent: safe on fresh and existing databases)
# then start the application.
CMD ["sh", "-c", "node node_modules/.bin/prisma db push --accept-data-loss && node dist/src/main"]
