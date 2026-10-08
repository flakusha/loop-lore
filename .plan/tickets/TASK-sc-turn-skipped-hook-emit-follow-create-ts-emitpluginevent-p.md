<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: SC turn.skipped hook emit (follow create.ts emitPluginEvent pattern)

**Status:** Not Started
**Priority:** medium
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** medium
**Effort:** S (hook emit at recordTurnSkip plus test)
**Summary:** recordTurnSkip fires a lightweight turn.skipped hook following the emitPluginEvent pattern from create.ts, so ambient and GM beats can claim the freed slot; cascade already reads the messages log, this adds the push.
**Context:** Source row matrix-story-coherence.md Cross-System Events (turn.skipped to GM beat gen, cascade, autonomy scheduler). Filed from 02-extract-features.md candidate 9, R02 candidate 9 confirmed. File: src/chat/service/crud/turn-skip.ts (emit site; consumer src/story/game-master or autonomy scheduler later). Reuse path exists: sibling CRUD create.ts:120, archive.ts, delete.ts already fan out via emitPluginEvent(registry.getAllEventHandlers()); follow that pattern, do not invent a bus. Dependency: this hook is the prerequisite for C2 composition work. Dedup: grepped index.json for turn.skipped and turn-skipped; only TASK-gm-beat-scheduling (scheduling, not the skip signal) plus cascade and event tickets (distinct layers).
**Acceptance Criteria:**
- recordTurnSkip emits the turn.skipped hook via the emitPluginEvent pattern on every recorded skip.
- Hook carries enough context (chat, actor, timestamp) for GM beat claim.
- Tests cover hook emission on skip and no duplicate on deduped advance.
- bun run check green.
**Related:** 02-extract-features.md candidate 9, R02 candidate 9, TASK-gm-beat-scheduling, TASK-turn-skip-event, TASK-turn-skip-cascade, C2 composition (dependent).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
