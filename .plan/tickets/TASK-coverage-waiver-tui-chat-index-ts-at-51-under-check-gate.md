<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage waiver: tui/chat/index.ts at 51% under check gate

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** Low
**Effort:** Trivial
**Epic:** epic-terminal-ui

## Summary:

src/tui/chat/index.ts measures 51.49 pct line coverage in the diff-scoped check
gate after the tui-token-configflag fix (BUG-tui-app-never-threads-sessiontoken):
the file's body is dominated by blessed widget binding (box / list / textbox)
and event-handler wiring that requires a live terminal to exercise. The new
diff surface (sessionToken threading + empty-string normalization in the
constructor) IS covered by the mock.module-based test file at
src/tui/chat/index.test.ts (its full suite passes). The remaining uncovered lines
are blessed widget plumbing exercised end-to-end via the blessed REPL harness
and `test:e2e`, neither of which the unit-suite coverage gate counts.

## Acceptance Criteria:

- [x] Waiver added — a per-file waiver for `src/tui/chat/index.ts` was added to
  `scripts/check/coverage/waivers.mjs`, keyed `tui:src/tui/chat/index.ts`, floor 51.
- [x] Tests passing — new mock.module suite covers sessionToken threading;
  pre-existing coverage of blessed widget paths remains as before the diff.
- [x] Waiver retired — once `src/tui/chat/index.ts` became importable under test
  and reached full coverage, the waiver it carried was deleted. The entry no longer
  appears in `scripts/check/coverage/waivers.mjs`; this was done on the
  `tui-shell-ac-closeout` branch, together with `TASK-tui-shell-testability.md`,
  whose AC3 required the retirement.
- [x] Documentation updated — this ticket records the waiver's addition and its
  retirement; no live waiver entry remains to cross-reference.
