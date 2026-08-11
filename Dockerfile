# ---------------------------------------------------------
# Base Setup
# Debian slim so OpenDAL's Rust glibc bindings work natively.
#
# Node 22, not 20: better-sqlite3 ships no Node 20 prebuilt binary, so install
# falls back to node-gyp and fails on this image, which has no Python or
# compiler. Node 20 is also past end of life.
#
# Trixie, not bookworm: opendal 0.49.6's binding links against GLIBC_2.38, and
# bookworm carries 2.36, so the module fails to dlopen on Debian 12.
# ---------------------------------------------------------
FROM node:22-trixie-slim AS base

# ---------------------------------------------------------
# Stage 1: Install Dependencies
# ---------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy only the files needed to install dependencies
COPY package.json package-lock.json ./

# We use --legacy-peer-deps here to handle the React 19 / Lucide conflict smoothly
RUN npm ci --legacy-peer-deps

# ---------------------------------------------------------
# Stage 2: Build the Next.js Application
# ---------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy the dependencies from the previous stage
COPY --from=deps /app/node_modules ./node_modules
# Copy all your source code
COPY . .

# Disable Next.js telemetry during the build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the project (this generates the .next/standalone folder)
RUN npm run build

# ---------------------------------------------------------
# Stage 3: Production Runner (The final, lightweight image)
# ---------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user for security best practices
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the public folder (images, favicons, etc.)
COPY --from=builder /app/public ./public

# Automatically leverage Next.js standalone output trace
# This only copies the exact files Next.js needs to run, keeping the image tiny
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Set user and expose the port
USER nextjs
EXPOSE 3000

# server.js is automatically created by Next.js in standalone mode
CMD ["node", "server.js"]