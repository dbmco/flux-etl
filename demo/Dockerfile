# Multi-stage build for monorepo (Next.js web, Node API, Python lake) on Fly.io

# 1) Install Node dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 py3-pip
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# 2) Build Node apps (web + api)
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 py3-pip
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile
RUN pnpm build:web && pnpm build:api
# Ensure public directory exists in builder stage
RUN mkdir -p apps/web/public

# Prepare a standalone API bundle using npm (for runtime)
WORKDIR /app/apps/api
RUN cp package.json /tmp/api-package.json
WORKDIR /tmp/api
RUN cp /tmp/api-package.json ./package.json \
  && npm install --only=production --legacy-peer-deps
RUN mkdir -p dist && cp -r /app/apps/api/dist/* dist/
WORKDIR /app

# 3) Install Python dependencies for lake app
FROM python:3.10-slim AS lake-deps
WORKDIR /app
COPY apps/lake/requirements.txt ./requirements.txt
RUN python -m venv /opt/venv \
  && . /opt/venv/bin/activate \
  && pip install --no-cache-dir -Ur requirements.txt

# 4) Final runtime image with supervisord managing all apps
FROM python:3.10-slim AS runner
WORKDIR /app

# Install Node runtime and pnpm for Node apps
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm ca-certificates && rm -rf /var/lib/apt/lists/* \
  && npm install -g corepack && corepack enable

# Copy standalone Next.js build
COPY --from=builder /app/apps/web/.next/standalone ./
# Copy Next.js static assets
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy self-contained API bundle from builder (dist + node_modules + package.json)
COPY --from=builder /tmp/api ./apps/api

# Go back to root workdir for supervisord
WORKDIR /app

# Copy Python venv and lake app source
COPY --from=lake-deps /opt/venv /opt/venv
COPY apps/lake ./apps/lake
ENV PATH="/opt/venv/bin:$PATH"

# Install supervisord
RUN pip install --no-cache-dir supervisor
COPY supervisord.conf /etc/supervisord.conf

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV API_PORT=4000

EXPOSE 3000 4000 8000

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
