<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: TASK-assistant-creative-studio-workflows.md claims `sd.ts` and `scenario-source.ts` were "deleted 2026-08-14" but both files still exist on disk

**Status:** ✅ Done (both files now gone: sd.ts already absent on dev HEAD; scenario-source.ts deleted as a zero-caller DB-less stub — storeScenarioSource returned fake `scenario-${Date.now()}` ids with no table. Parent TASK Phase-3 stub-reactivation lines now historical; see TASK-assistant-creative-studio-workflows.md update.)
**Severity:** low
**Priority:** low
**Effort:** small
**Type:** BUG
**Epic:** epic-assistant-creative-studio-workflows
**Files:** .plan/tickets/TASK-assistant-creative-studio-workflows.md:34-35, 119-120, 155-156; src/assistant/sd.ts; src/assistant/scenario-source.ts

## Issue

`TASK-assistant-creative-studio-workflows.md` claims:

- Line 34-35: `SDRequest / generateImage | ✅ Removed 2026-08-14 | deleted (dead stub, zero imports; reimplement from scratch)`
- Line 119: `[x] ~~Activate src/assistant/sd.ts stubs~~ — DELETED 2026-08-14`
- Line 120: `[x] ~~Activate src/assistant/scenario-source.ts stubs~~ — DELETED 2026-08-14`
- Line 155-156 (Files table): `src/assistant/sd.ts | reimplement (deleted 2026-08-14)`, `src/assistant/scenario-source.ts | reimplement (deleted 2026-08-14)`

But `ls` of `src/assistant/` shows both files exist:

- `src/assistant/sd.ts` — 3.5KB, contains `SDRequest` type, `generateImage` stub, asset ID generation (`sd-${Date.now()}`), seed assignment.
- `src/assistant/scenario-source.ts` — 2.7KB, contains `ScenarioSource` type, tag helpers, world-sketch persistence functions, all marked with TODO comments.

The "DELETED" strikethrough claim is wrong — files were not deleted. They're either:
- Dead code that should be deleted and the TASK is right in spirit (then the strikethrough is a TODO statement, not a fact), or
- Live code that's been forgotten (then the TASK is stale and the files should be referenced as in-progress).

Either way, the TASK as written is misleading.

## Why it matters

Discoverability / drift. Future contributors reading the TASK will assume `sd.ts` and `scenario-source.ts` are gone and either:
- Recreate them as new files (duplication).
- Skip the related work entirely (false completion).

The same TASK is the parent for `src/assistant/workflow-runner.ts` (a "new" file). If the workflow runner is meant to call into `sd.ts`, the deletion claim contradicts the implementation.

## Evidence

- `src/assistant/sd.ts` — file exists, contains stub `generateImage` and `SDRequest` types.
- `src/assistant/scenario-source.ts` — file exists, contains `ScenarioSource` type and helper stubs.
- `.plan/tickets/TASK-assistant-creative-studio-workflows.md` — multiple lines claim both were deleted.

## Concrete fix

1. Inspect both files to determine their actual state (live stubs vs. dead code).
2. Update the TASK to reflect reality:
   - If they ARE dead code: file a separate BUG/ticket to actually delete them; remove the false "DELETED" claim from the TASK.
   - If they're live stubs awaiting implementation: update the TASK's Status table and Files table to mark them as 🟡 stubs, not "deleted".
3. Cross-check other tickets in the same epic for similar "DELETED" claims that may also be stale.
4. Add a `last-verified` date to the TASK so future readers know when the deletion claim was last checked against the filesystem.

## Tests

- This is a doc/ticket-fidelity bug, not a code bug. Test = manual verification that the TASK and filesystem agree.
- Add a one-liner check to `bun run plan:sync` that flags tickets referencing deleted files: `for t in .plan/tickets/*.md; do grep -E "deleted|removed" "$t" | while read line; do file=$(echo "$line" | grep -oE 'src/[^ ]+\.ts'); if [ -f "$file" ]; then echo "STALE: $t references deleted file that exists: $file"; fi; done; done`.

## Related

- `epic-assistant-creative-studio-workflows.md` (parent epic).
- `TASK-precompiled-templates-injection.md` (sibling task in same epic — verify its claims too).
