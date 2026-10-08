<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: AC9 notifyFactorChange trigger helper (ladder-ready, no tables)

**Status:** Not Started
**Priority:** low
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** S (single trigger helper plus new test file)
**Summary:** Add a notifyFactorChange(db, userId, kind, action) trigger covering enroll, verify, revoke, and address-change, honoring the last-standing rule (never notify only the changed channel). Ships the trigger only; F9 wires it when factor tables land.
**Context:** Source row matrix-authentication-channels.md AC9 (provisioning x notifications). Filed from 02-extract-features.md candidate 7, R02 candidate 7 confirmed. Files: src/notifications/service/triggers.ts only (1 file; F9 caller later). No auth_factors or FactorKind code exists in src yet, so trigger-only scope is deliberate. Reuse NotificationType.System to avoid enum and migration churn; needs a new triggers test file (none exists under src/notifications). Dedup: grepped index.json for factor change notif and notifyFactor; zero hits (F1/F2/F3/AC12 table and policy tickets exist, distinct).
**Acceptance Criteria:**
- notifyFactorChange helper exists with enroll, verify, revoke, address-change actions.
- Last-standing rule honored: notification never goes only to the changed channel.
- New trigger test file covers all four actions plus the last-standing rule.
- bun run check green.
**Related:** 02-extract-features.md candidate 7, R02 candidate 7, TASK-AUTH-FACTORS-SCHEMA-AND-SERVICE-CORE-F1 (F9 wiring later).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
