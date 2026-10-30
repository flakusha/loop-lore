<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: PTY spawn audit logging to harness exec-log

**Status:** Done
**Scope:** Browser-side terminal EDITOR support epic (S1 config, S2 URI links, S3 PTY route, S4 sandbox tree)
**Priority:** low
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. Wire every terminal PTY spawn (command, sandbox root, pid, session) into src/harness/exec-log.ts via recordExecRun. Admin-only route, allowlisted EDITOR spawn, log covers audit. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md Security section.

**Context:**

Implemented alongside approach B in worktree feat-web-editor-support (slice 3). Every successful upgrade calls `appendExecLog(buildTerminalSpawnRecord({ editor, file, rootDir, pid, userId }))` at spawn time (terminal-ws.ts `open()`), so the audit line exists even if the process is later killed by idle/disconnect. Record: task `terminal-editor`, taskType `harness` (a `HARNESS_TASK_TYPES` member), model = editor binary, pattern `web-terminal`, patternDetail `file=<repo-relative>`, result `ok`, pid from `Bun.spawn`, msg carries the acting user. **Deviation from ticket text:** the exec-log API is `appendExecLog(record)` — `recordExecRun` does not exist in src/harness/exec-log.ts; recorded here and in CHANGELOG. Admin-only is enforced upstream by the `requirePermission("admin.system")` gate; the spawn is allowlisted by construction ($VISUAL/$EDITOR + containment-checked file only).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Evidence:** `buildTerminalSpawnRecord` unit-tested in `src/server/terminal-ws.test.ts` (taskType `harness`, pattern `web-terminal`, patternDetail `file=src/views/blog.html`, pid 4242, result `ok`, msg contains acting user) — part of the 26-pass S3 run. Append rides the existing `appendExecLog` path (never throws; covered by harness exec-log tests). CHANGELOG bullet + ticket context record the `recordExecRun` → `appendExecLog` name deviation.

git issue: 5669358

**Resolved:** 2026-10-30 registry-driven close: git issue 5669358 (registry tip: 7288961b7 Konstantin Fedotov Close issue)
