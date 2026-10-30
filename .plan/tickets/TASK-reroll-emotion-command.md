<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: reroll-emotion command

**Status:** Done
**Scope:** Emotion-Avatar Completion
**Priority:** medium
**Effort:** Medium
**Epic:** epic-avatar-regeneration-control
**Related:** `epic-emotion-avatar-message-binding.md`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add `/reroll-emotion [slot]` assistant command wrapping the emotion-avatar
regeneration service, so avatar iteration stays in the conversation that
triggered the emotion change. Source: assistant integration review 2026-10-23
(gap 4 / rec 4).

**Context:**

Seed reuse/regeneration is reachable only via
`POST /actors/:id/emotion-avatars/regenerate`
(`routes/character-emotion-avatars.ts`, `emotion-avatar-service/seed.ts`) and
the character panel — even though avatar emotion changes are
conversation-driven (merged `b430b0c94`, `01b426213`).

**Approach**

- New `src/assistant/commands/reroll-emotion.ts` delegating to the
  `emotion-avatar-service` regenerate logic (reuse the route's service call,
  not the HTTP route).
- Render through the existing avatar action handlers.

**Acceptance Criteria:**

- [x] `/reroll-emotion [slot]` regenerates the actor's current emotion avatar
- [x] Actor resolution follows the command context (mentioned actor in group chat)
- [x] Result avatar event renders in chat
- [x] Unit tests: dispatch → service regenerate; missing actor/slot error paths
