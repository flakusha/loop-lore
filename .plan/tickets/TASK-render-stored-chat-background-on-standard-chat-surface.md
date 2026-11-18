<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: render stored chat background on standard chat surface

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-immersion-presentation.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Chat background storage, API and location sync are shipped, but no view consumes the stored asset id. The VN background_url field is never populated, leaving both surfaces without the chosen background.

**Evidence (dev 2026-11-18):** chat-backgrounds service and routes shipped; TASK-chat-backgrounds-location-sync.md is Done; no rendering of asset_id in chat views; VN reads a never-populated background_url field (report 05).

**Scope:** derive a backgroundImageUrl from the chat background asset id; add the backdrop element and CSS on the standard chat surface; reuse the existing loadBackground callers; one unit test.

**Acceptance Criteria:**

- [ ] selected background appears in standard chat
- [ ] changing or clearing it updates without reload
- [ ] no background yields current appearance

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
