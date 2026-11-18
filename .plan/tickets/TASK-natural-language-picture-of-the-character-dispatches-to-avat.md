<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: natural language picture of the character dispatches to avatar

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-assistant-generation-extensions.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The character picture affordance exists as /avatar, but natural-language phrasing is not wired: /make character produces an entity spec and in-story image handoff is unbuilt.

**Evidence (dev 2026-11-18):** report .tmp/intercom/plan-wave/05-image-display.md IMG-2; src/assistant/commands/avatar.ts:20-43; src/regex/intent.ts:28-33; FEAT-in-story-character-generation-via-assistant-chat-handoff.md Not Started.

**Scope:** add a narrow intent pattern for 'picture/image of `<character>`' that dispatches to the existing avatar generation path with the character identity anchor; keep entity-spec generation for /make character; one intent test and one route test.

**Acceptance Criteria:**

- [ ] natural-language request generates and binds a character image
- [ ] no regression to entity-spec generation
- [ ] ownership and asset binding unchanged

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
