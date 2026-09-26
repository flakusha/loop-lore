<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Turn skip GM absence contract

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** GM prompt contract for absent actors: hold keeps beat with conspicuous inactivity (later spotlight); advance lets GM elapse scene time (meanwhile). Absent actor is never narrated into autonomous action.

**Context:** Turn-skip core shipped 2026-09-25 (event, gate interlock, composer UI, cascade filter in `src/generation/auto-gen/pass-filter.ts`). Last open item before cascade completes: the GM prompt text that governs hold vs advance when an actor is absent. Lives in the prompt assembly path (`src/assistant/prompt-assembler.ts` or section equivalent), GM-role gated like shadow notes.

**Acceptance Criteria:**

- [ ] Hold produces no scene-time cues; advance visibly progresses beat (test).
- [ ] Absence never attributes action to the absent actor (test).
- [ ] `bun run check` green.
