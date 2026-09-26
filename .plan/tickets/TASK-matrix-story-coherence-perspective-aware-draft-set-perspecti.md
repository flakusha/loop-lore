<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: MATRIX-story-coherence-perspective-aware-draft: set perspective-aware mood-intent dosage for drafts

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-two-pass-delivery
**Tags:** matrix-gap, story-coherence
**Context:** Two-pass delivery draft-framing decision SC9; perspective-aware mood/intent dosage for drafts is TBD.

## Summary

**Status:** open
**Priority:** medium
**Effort:** Small
**Summary:** matrix-story-coherence SC9 is open: draft-stage mood/intent extraction should be perspective-aware (3rd-person scene framing reads differently), but dosage is TBD. Non-blocking for sequencing yet needed before two-pass delivery lands so pass-1 drafts carry voice-consistent prompts.
**Acceptance Criteria:**
- [ ] Perspective-aware dosage for draft mood/intent extraction specified (none/subtle/explicit per perspective)
- [ ] Contract with perspective axis (first/third/narrator) and GenerationDraft handoff documented
- [ ] matrix-story-coherence.md SC9 row updated with dosage decision
**Tags:** matrix-gap, story-coherence
**Related:** src/memory/provision.ts, src/group-chat/turn-selector.ts, src/chat/service/crud/turn-skip.ts, .plan/matrix-story-coherence.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
