<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system-config: surface missing schema sections

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

13 schema sections have no admin UI or example file: assistant.travelPrompts, ageGate, cron (enabled/jobs), dynamicResponse, federation (enabled/seeds/peers/meshPsk/duplication), frontend.mode, hooks (4 toggles), idempotency (enabled/backend/ttlMs/bypassHeader), observability (health/metrics), seeding, characters, testing. Acceptance: each section gets seedDefaults keys where runtime-mutable; read-only/deploy-time sections (federation meshPsk, testing) marked admin-readonly or excluded with reason; admin UI groups added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
