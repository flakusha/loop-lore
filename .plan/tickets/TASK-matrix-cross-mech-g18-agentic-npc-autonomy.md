<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-cross-mech-g18: Agentic NPC autonomy — memory + goals + emotion + autonomous action

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Type:** Task
**Summary:** Move NPC/actor behaviour from scripted trees toward goal/memory-driven autonomy. Touches Battle (enemy AI), Social (interaction choice), Narrative (story awareness), CharCore (coping/mood), Companion (mount/pet intent). Folded into existing actor/NPC epics — no new epic.
**Context:** `matrix-cross-mechanics.md` G18 is 🔴 High (future), P6+ deferred. Inspiration: Inworld AI, Convai, generative-agents. Battle NPC AI is currently scripted (see G3 ticket for the gap); no autonomous NPC goal stack exists. The matrix says "turn npcs/battle NPC-AI from scripted toward goal/memory-driven. P6+, fold into existing actor/NPC epics (no new epic)."

## Current state

- `src/actors/` holds personality/mood but no long-lived `Goal` or `Intent` objects.
- `src/battle/ai/enemy-decision.ts` picks from a fixed action table.
- `src/social/` has reputation but no NPC-to-NPC motivation.
- Memory exists (`src/memory/`) but isn't queried for NPC goal selection.

**Acceptance Criteria:**

- [ ] Add `Goal` schema in `src/actors/goals.ts` with `(id, owner, kind, priority, deadline, status)` and CRUD.
- [ ] NPC decision loop (`src/battle/ai/enemy-decision.ts`, social sim) reads goal list + recent memory to weight actions; falls back to current scripted behaviour when no goals present (no regression).
- [ ] Autonomous NPC actions emit `npc.action` events; auditable.
- [ ] Tests in `src/actors/autonomy.test.ts` cover goal-priority ordering, deadline pressure, memory-weighted selection.
- [ ] `bun run check` green.

**Tags:** npc, autonomy, goals, memory, actor, P6+
**Related:** src/actors/, src/battle/ai/, src/social/, src/memory/, .plan/matrix-cross-mechanics.md (G18 row), epic-emergent-narrative-design.md, epic-character-internal-traits.md

git issue: 4e6e2b9
