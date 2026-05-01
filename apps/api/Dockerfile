# =============================================================================
# HaloFrame API — production Dockerfile for Railway
#
# Multi-stage: a `deps` stage that installs all workspace deps and builds the
# @haloframe/shared package, a `build` stage that typechecks + transpiles the
# API, and a slim `runtime` stage that copies only what's needed to run.
# =============================================================================

# ----------------------------------- deps ------------------------------------
FROM node:20-alpine AS deps
WORKDIR /repo

# Copy workspace manifests so npm can resolve the workspace graph.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --no-audit --no-fund

# ---------------------------------- build ------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo

# npm workspaces hoist everything to /repo/node_modules; per-workspace
# node_modules typically don't exist after `npm ci`, so only copy the
# hoisted root.
COPY --from=deps /repo/node_modules ./node_modules
COPY . .

# Build shared first so the API can consume its compiled output.
RUN npm run build --workspace=@haloframe/shared
RUN npm run build --workspace=@haloframe/api

# --------------------------------- runtime -----------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

# Non-root user per standard container hardening.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs haloframe

ENV NODE_ENV=production
ENV API_PORT=4000

# Copy the workspace just enough to run the API.
COPY --from=build /repo/package.json ./
COPY --from=build /repo/package-lock.json ./
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/packages/shared/package.json ./packages/shared/
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist

# Prod-only install to drop devDeps.
RUN npm ci --omit=dev --no-audit --no-fund --workspace=@haloframe/api

USER haloframe
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
