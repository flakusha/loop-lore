<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: docs(config): add missing sections to config examples

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** auth-config-contracts

**Summary:**

Sources: stream-c #1. Where: configs/config.example.toml:1-348; configs/config.example.yaml:11-249; configs/config.*.example.{toml,yaml}; src/config/schema/config.ts:40-69. Gap: neither the main example configs nor any per-domain example documents observability, idempotency, hooks, cron, seeding, federation, or testing - 7 of 27 sections have zero example coverage, so probe opt-ins, idempotency backend/TTL, and mesh peers are undiscoverable from configs/ alone. Acceptance: commented stanzas with defaults exist for all 7 sections across main + per-domain examples; a drift test asserts every Config key appears in the examples. Priority: low - docs discoverability; no runtime effect. Verified 2026-10-11: frontend covered in both main examples; narrowed to 7 sections.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
