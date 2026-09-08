<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Narration levels (actor-only vs actor+narrator)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Support 1/2-level narration as per-chat configuration: level 1 rotates actors only (actor, actor, actor); level 2 interleaves a narrator (actor, narrator, actor, actor, narrator — cadence configurable, dreamrunner-style variants). Today sceneBasedSelect hardcodes narrator-every-3rd in src/turning/turn-strategies.ts with no level enum and no narrator-vs-actor message distinction. Introduce a level enum (off | actors-only | actors-plus-narrator), parametrize narrator cadence, render narrator turns under the MessageKind narration contract (epic-narration-actor-separation), and keep narrator-absent fallback (actor ambient-notice, never omniscient).

## Acceptance Criteria

- [ ] Per-chat narration level config (off / actors-only / actors-plus-narrator)
- [ ] Narrator cadence configurable (no hardcoded every-3rd)
- [ ] Narrator turns stamped/rendered as narration kind, distinct from actor turns
- [ ] Level off produces zero narrator turns; absence falls back to actor notice
- [ ] Tests passing
