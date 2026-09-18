<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: In-Place Generation Owner Backfill

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-assistant-gm-flows
**Tags:** in-place-generation, backfill, ownership, memory
**Depends on:** `FEAT-in-story-character-generation-via-assistant-chat-handoff.md` (hub mechanism)

## Summary

After an in-place generated entity (character, NPC, item, bestiary species) passes
review/approval, it can be **backfilled as owner for previous messages**: the
messages that introduced or referenced it before formal creation are re-attributed
or linked to the entity, so memory, prompts, and tracking see a continuous
participant instead of an entity that begins at creation time.

## Design

- **Attribution, not rewrite:** backfill writes entity↔message links and authorship
  metadata only; message content is never retro-edited.
- **Ownership semantics per kind:** characters/NPCs become author/owner of messages
  they narrated; items and species become referenced-by links (polymorphic linking
  precedent from the asset system; message-binding precedent from
  `epic-emotion-avatar-message-binding.md`).
- **Post-approval only:** backfill runs after the review/approval gate accepts the
  finalized spec; rejected entities leave prior messages untouched.
- **Candidate window:** the detection phase of the in-place mechanism records which
  messages surfaced the entity; those are the backfill candidates, surfaced in the
  review UI with per-message accept/skip.
- **Idempotent:** re-running backfill for the same entity/message pair is a no-op;
  manual unlink is possible via the entity edit surface.

## Acceptance Criteria

- [ ] Approval-gated: no backfill occurs before the entity's review/approval completes.
- [ ] Per-message candidate selection (accept/skip) exposed in the review step.
- [ ] Characters/NPCs: authorship re-attributed on accepted messages; prompts and
      memory assembly resolve the entity for the pre-creation window.
- [ ] Items/species: referenced-by links created on accepted messages; item/note/
      quest tracking and memory injection see the entity across the window.
- [ ] Idempotent re-runs; manual unlink available; message content never modified.
- [ ] Unit tests: gate ordering, per-kind link semantics, idempotency; integration:
      in-place generation → approval → backfill → prompt assembly sees the entity.

## Related

- `FEAT-in-story-character-generation-via-assistant-chat-handoff.md` (hub)
- `TASK-creation-chat-world-location-context-scoping.md` (creation chat context)
- `epic-emotion-avatar-message-binding.md` (message-binding precedent)
- `epic-memory-knowledge-systems.md` (memory injection tie-in)
