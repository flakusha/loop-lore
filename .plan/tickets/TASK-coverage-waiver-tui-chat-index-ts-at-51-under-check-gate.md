<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage waiver: tui/chat/index.ts at 51% under check gate

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** [OK] Done
**Priority:** Low
**Effort:** Trivial

## Summary:

src/tui/chat/index.ts measures 51.49 pct line coverage in the diff-scoped check
gate after the tui-token-configflag fix (BUG-tui-app-never-threads-sessiontoken):
the file's body is dominated by blessed widget binding (box / list / textbox)
and event-handler wiring that requires a live terminal to exercise. The new
diff surface (sessionToken threading + empty-string normalization in the
constructor) IS covered by the mock.module-based test file at
src/tui/chat/index.test.ts (3 tests, all pass). The remaining uncovered lines
are blessed widget plumbing exercised end-to-end via the blessed REPL harness
and `test:e2e`, neither of which the unit-suite coverage gate counts.

## Acceptance Criteria:

- [x] Implementation complete — per-file waiver added to
  scripts/check/coverage.mjs WAIVERS, key `tui:src/tui/chat/index.ts`, floor 51.
- [x] Tests passing — new mock.module suite covers sessionToken threading;
  pre-existing coverage of blessed widget paths remains as before the diff.
- [x] Documentation updated — this ticket + waiver entry reference each other.
