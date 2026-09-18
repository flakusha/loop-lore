# SPDX-License-Identifier: LGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Loop Lore Contributors

# Multi-stage build: deps → frontend build → slim runtime.
# Build:  docker build -t loop-lore:latest .
# Run:    see deploy/docker-compose.yml (Caddy TLS + app + Postgres)
#
# Deliberately NO `ENV NODE_ENV=production` here: the image must stay
# login-capable over plain HTTP for proxy-less local docker runs. The
# cookie Secure flag is enabled per-deployment via LL_COOKIE_SECURE=true
# (set in deploy/docker-compose.yml behind Caddy) — see
# src/routes/auth/shared.ts::setTokenCookie decision matrix.

FROM oven/bun:1 AS deps
WORKDIR /app
# `giwt` is a git dependency — bun install needs git + CA certs
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY scripts ./scripts
COPY src ./src
RUN bun run build:frontend

FROM oven/bun:1-debian-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# git: bun install --production resolves the giwt git dependency.
# openssl: dev self-signed cert fallback in src/config/cert.ts (unused
# behind Caddy, harmless to have present).
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist/public ./dist/public
COPY src ./src
RUN mkdir -p /app/loop-lore-data && chown -R bun:bun /app
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/server/index.ts"]
