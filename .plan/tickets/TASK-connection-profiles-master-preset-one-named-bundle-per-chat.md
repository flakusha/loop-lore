<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Connection Profiles / master preset (one named bundle per chat)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** preset, connection-profile, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ST gap closer (research 01): one named bundle (API+model+preset+persona) per chat instead of scattered per-chat settings. Check existing preset/connection-profile surfaces first; if absent, add a named master-preset entity selectable per chat. Research: .tmp/research/ai-cheat/01-outside-takes.md gap 2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
