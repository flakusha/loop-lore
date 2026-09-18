<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-001: Dockerize the application

**Status:** 🟡 In Progress — Dockerfile + compose wiring landed; docker-build ACs pending verification (no docker on dev host)
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status**: in-progress
**Priority**: high
**Labels**: devops, docker, containerization
**Epic**: epic-deployment-infrastructure
**Assignee**: DevOps Team

## Description

Containerize the loop-lore application for consistent deployment across environments.

## Tasks

- [x] Create multi-stage Dockerfile for Bun application
- [x] Separate stages: builder (for frontend build) and runtime
- [x] Optimize image size (use distroless or slim base if possible) — oven/bun:1-debian-slim runtime, prod-only install
- [x] Ensure all services (server, asset processing) are included
- [ ] Test Docker build and run locally — BLOCKED: no docker on dev host; build-stage commands proven natively (bun run build:frontend)
- [ ] Verify health check endpoint works in container — healthcheck expression validated (`bun -e` fetch /api/health, exit semantics proven); in-container run pending docker
- [x] Document environment variables required
- [x] Add .dockerignore to exclude unnecessary files
- [x] Ensure compatibility with existing deployment scripts — deploy/docker-compose.yml wired (build: .., healthchecks, ordered depends_on, app_data volume)

## Acceptance Criteria

- Docker image builds successfully: `docker build -t loop-lore:latest .`
- Container runs and serves HTTP requests on port 3000
- Health check endpoint returns 200
- Image size < 500MB (optimized)
- Docker Compose file provided for local development

## Related Files

- Dockerfile (to be created)
- docker-compose.yml (to be created)
- .dockerignore (to be created)

## Notes

- Consider using oven/bun base image if available
- Frontend build step should output to public/
- Asset service may require volume mounts for storage