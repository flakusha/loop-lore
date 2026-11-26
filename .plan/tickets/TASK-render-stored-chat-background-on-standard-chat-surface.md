<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: render stored chat background on standard chat surface

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-immersion-presentation.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Chat background storage, API and location sync are shipped, but no view consumes the stored asset id. The VN background_url field is never populated, leaving both surfaces without the chosen background.

**Evidence (dev 2026-11-18):** chat-backgrounds service and routes shipped; TASK-chat-backgrounds-location-sync.md is Done; no rendering of asset_id in chat views; VN reads a never-populated background_url field (report 05).

**Scope:** derive a backgroundImageUrl from the chat background asset id; add the backdrop element and CSS on the standard chat surface; reuse the existing loadBackground callers; one unit test.

**Acceptance Criteria:**

- [x] selected background appears in standard chat
- [x] changing or clearing it updates without reload
- [x] no background yields current appearance

**Context:**

Shipped on branch `image-to-background`: `backgroundImageUrl` derives the raw asset URL, the standard chat view renders the backdrop, and CSS keeps it behind chat content. Reused the existing `loadBackground` callers; no background leaves the current appearance. Focused frontend tests cover URL derivation plus load/toggle/set/remove paths and reach 100% line coverage of `src/frontend/alpine/chat-backgrounds.ts`.
