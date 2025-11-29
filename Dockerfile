# Multi-stage build for Next.js 15 app on Fly.io

# 1) Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
# Install OS deps needed for sharp / next image optimizations
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml ./
# Use corepack to enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# 2) Build the app
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Ensure Next.js outputs the standalone server
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm build

# 3) Run the app with minimal runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Fly will route to this port
ENV PORT=3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy the standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Make sure the app runs as non-root
USER 1001

EXPOSE 3000
# Next.js standalone build has a server.js at project root in the standalone output
CMD ["node", "server.js"]
