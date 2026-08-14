# TASK-001: Dockerize the application

**Status**: pending
**Priority**: high
**Labels**: devops, docker, containerization
**Epic**: epic-deployment-infrastructure
**Assignee**: DevOps Team

## Description

Containerize the loop-lore application for consistent deployment across environments.

## Tasks

- [ ] Create multi-stage Dockerfile for Bun application
- [ ] Separate stages: builder (for frontend build) and runtime
- [ ] Optimize image size (use distroless or slim base if possible)
- [ ] Ensure all services (server, asset processing) are included
- [ ] Test Docker build and run locally
- [ ] Verify health check endpoint works in container
- [ ] Document environment variables required
- [ ] Add .dockerignore to exclude unnecessary files
- [ ] Ensure compatibility with existing deployment scripts

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