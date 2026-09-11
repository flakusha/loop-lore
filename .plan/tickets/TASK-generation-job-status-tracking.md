<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Generation-Job-Status-Tracking

**Status:** 🔄 In Progress (emotion-avatar batch half landed: `013_generation` table + `job-records` start/finish wrappers on dev; open remainder: general generation-engine hooks + gallery-service query side)
**Priority:** Medium
**Effort:** Medium

## Summary

Implement schema and service hooks to track the lifecycle of image generation tasks. Background: Gallery UI needs to know if an asset is still being generated or failed. Scope: Define GenerationJob table and status updates. Acceptance Criteria: Job status persists across restarts and is queryable by gallery-service.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
