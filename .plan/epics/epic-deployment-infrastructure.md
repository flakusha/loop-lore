# Epic: Deployment Infrastructure (Docker & Bare Metal)

## Overview
Containerize the loop-lore application and establish deployment strategies for both containerized environments (Docker) and bare-metal servers. Evaluate cost-effective hosting options that support storage and GPU compute for LLM inference workloads.

## Goals
- Package the application in a reproducible Docker image
- Create a bare-metal deployment guide for on-premises or cloud VM deployments
- Compare and evaluate affordable hosting providers with storage and GPU capabilities
- Establish CI/CD pipeline for automatic deployments
- Implement health checks and monitoring for production readiness

## Scope
- **In-scope**: Loop-lore (RPG chat application) built with Bun, Elysia, HTMX + Alpine.js
- **Out-of-scope**: Application code changes (these are infrastructure improvements)

## Deliverables

### Epic Tasks
1. **TASK-001**: Dockerize the application
   - Containerize all services (server, frontend, assets)
   - Define multi-stage Docker build for minimal image size
   - Ensure backward compatibility with existing deployment

2. **TASK-002**: Bare metal deployment guide
   - Document hardware requirements (CPU, RAM, NVMe SSDs)
   - Step-by-step guide for on-premise deployment
   - Storage mounting and persistence configuration
   - GPU compute setup where applicable

3. **TASK-003**: Evaluate hosting providers
   - Compare VPS options with storage (SSD, S3, etc.) and GPU compute (Lambda Labs, RunPod, Vast.ai, OVH, Hetzner)
   - Cost analysis for P3-P5 instance tiers
   - Performance benchmarks for LLM inference (token latency, throughput)
   - Recommendation report with pros/cons for each provider

4. **TASK-004**: CI/CD pipeline
   - Automated Docker build and deployment to serving infrastructure
   - Environment parity (dev → staging → prod)
   - Rollback and health check integration

5. **TASK-005**: Monitoring & observability
   - Health check endpoints for container orchestration
   - Basic metrics collection (CPU, memory, disk I/O, request latency)
   - Alerting rules for critical failures

## Success Criteria
- Docker image builds successfully on Linux x86_64
- Bare metal guide is tested on a reference machine
- At least three hosting providers evaluated with cost/performance comparison
- CI/CD pipeline passes lint, test, and deploy stages
- Monitoring stack integrated and verified

## Risks
- Docker networking might conflict with existing setup
- GPU instances may have variable pricing; need to research current rates
- Some providers may lack SSH access for bare metal management

## Related Epics
- epic-deployment-topologies.md
- epic-database-asset-snapshot-recovery.md
- epic-frontend-admin

## Assumptions
- Current codebase is stable and deployable
- Team has access to cloud provider accounts for testing
- Budget flexibility for evaluating multiple hosting options
