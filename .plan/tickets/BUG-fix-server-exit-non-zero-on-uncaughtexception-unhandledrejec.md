<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): exit non-zero on uncaughtException/unhandledRejection shutdown

**Status:** Done
**Status Note:** fixed on this branch — the shared shutdown path now carries an explicit exit code: signal-triggered shutdowns exit 0, crash paths (uncaughtException/unhandledRejection) exit 1 (`src/server/start.ts:33-37`, `:246-310`). Regression test in src/server/start.test.ts ("exits non-zero on a crash-path shutdown and zero on a signal shutdown").
**Priority:** medium
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #10. Where: src/server/start.ts:215-233, :243-263 (shared shutdown ends process.exit(0) on all paths). Gap: crash-path shutdowns report success, so orchestrators and alerting never fire on uncaughtException/unhandledRejection - the process looks cleanly stopped. Acceptance: shutdown takes an exit code: 0 for SIGTERM/SIGINT/SIGHUP, non-zero for crash paths; observable process exit code differs between clean stop and crash. Priority: medium - supervisor/alerting visibility; one-line-class fix with outsized observability value.

**Context:**

`shutdown()` ended in `process.exit(0)` on every path, so a crash-triggered shutdown reported success to the supervisor and no alerting fired. The exit code is the only signal a supervisor sees, so the fix threads the intended exit code through the one shared shutdown path instead of special-casing the crash handlers. Alternatives considered: a separate `crashShutdown()` (duplicates the teardown sequence) and setting `process.exitCode` instead of `process.exit` (the teardown must still force the exit after the logger flush race). `shutdown()` and `runShutdown()` now take an options object so the signal name and the exit code travel together; the catch-all path of `runShutdown` keeps exiting 1.

**Acceptance Criteria:**

- [x] Signal-triggered shutdown (SIGTERM/SIGINT/SIGHUP) exits 0
- [x] Crash-path shutdown (uncaughtException/unhandledRejection) exits non-zero (1)
- [x] The exit code is threaded through the shared shutdown path, not duplicated per handler
- [x] Regression test asserts both exit codes (fails before the fix, passes after)
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Root cause: `shutdown(_signal)` ignored its argument and always called `process.exit(0)`, so the crash handlers could not report a failure.
- Changed `src/server/start.ts:33`/`:37` (exit-code constants), `:246` (`shutdown` takes `{ exitCode }`), `:275` (`runShutdown` takes `{ signal, exitCode }`), `:282-287` (signal handlers pass `CLEAN_EXIT_CODE`), `:299`/`:310` (crash handlers pass `CRASH_EXIT_CODE`).
- Regression test: `src/server/start.test.ts` — "exits non-zero on a crash-path shutdown and zero on a signal shutdown" (2 pass / 3 fail before the fix, 5 pass / 0 fail after).
