# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# NEXT_PUBLIC_* vars are baked into the JS bundle at build time, not runtime.
# Pass the correct value here so API calls go to the right host/port.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ARG NEXT_PUBLIC_APP_NAME=Oralign
ARG NEXT_PUBLIC_APP_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
# next build --output=standalone copies only what the server actually needs.
# No full node_modules required — drops image from ~1.4 GB to ~250 MB.
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache dumb-init

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Standalone server + its trimmed node_modules
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
# Static assets served by the standalone server
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
# Public assets (images, fonts, etc.)
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001',r=>{process.exit(r.statusCode<500?0:1)}).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
# Standalone output puts server.js at the root of the standalone dir
CMD ["node", "server.js"]
