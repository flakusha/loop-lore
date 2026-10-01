<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Narration levels (actor-only vs actor+narrator)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-narration-pipeline.md
**Tags:** narration-pipeline
**Summary:** Per-chat narration level config (off | actors-only | actors-plus-narrator): level 1 rotates actors only; level 2 interleaves a narrator at configurable cadence (no hardcoded every-3rd).

**Context:** `sceneBasedSelect` in `src/turning/turn-strategies.ts` hardcodes narrator-every-3rd with no level enum and no narrator-vs-actor message distinction. Narrator turns render under the MessageKind narration contract (`epic-narration-actor-separation.md`); narrator-absent fallback is actor ambient-notice, never omniscient.

**Acceptance Criteria:**

- [ ] Narrator cadence configurable; level off produces zero narrator turns.
- [ ] Narrator turns stamped/rendered as narration kind, distinct from actor turns.
- [ ] Absence falls back to actor notice (test); `bun run check` green.
