<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Internalize AI Dungeon 2021 Moderation Lesson

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Related:** epic-chat-lifecycle-moderation.md, epic-nsfw-game-mechanics.md, epic-age-gate (age-gate/)

## Summary

AI Dungeon's 2021 content-moderation controversy (filter on minor-related content →
privacy backlash from human review of private stories → review-bombing) is the canonical
cautionary tale. loop-lore must design moderation/consent/age-gating **in from the
start**, local-first, without retrofitted privacy-violating filters.

## Rationale

- Research (rpg-landscape.md §5.1, §8.5): the backlash was about _privacy_ + _false
  positives_ + _lack of communication_, not moderation per se.
- Forum-RP consent/reputation systems (§4.3) are the pre-engine social layer to mirror.

## Current State

- `age-gate/` service exists; `epic-chat-lifecycle-moderation.md` covers bans/NSFW/
  shadowing.
- No explicit "local-first moderation, no private-story human review" design note
  linking the AI Dungeon lesson.

## Action

- [ ] Add a "Moderation design principles" note to epic-chat-lifecycle-moderation.md:
      local-first, deterministic filters, no private-content human review, clear comms.
- [ ] Verify age-gate + NSFW policy satisfy consensual-NSFW framing (§5.2).
- [ ] Ensure generation policy-detection runs client/local, not via third-party review.
