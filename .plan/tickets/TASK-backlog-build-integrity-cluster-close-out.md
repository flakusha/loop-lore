<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — verify Build Integrity Cluster close-out (3 BUGs + plan:sync orphan)

**Status:** open
**Priority:** high
**Effort:** Small
**Type:** Task
**Summary:** The 2026-09-03 Build Integrity Cluster (open-build-integrity.md) flagged 3 untracked tsc errors and a plan:sync orphan-issue bug. Per open-inflight.md § 2026-09-11 core-finalization wave, the trio has landed (commit refs 4a1f56b8, 1cddba36) and the cluster pointer file is staged for retirement — this ticket is the formal verification + index backfill + retirement pass before A9.
**Context:** Three BUGs (Bucket X): unused import in routes/commands/index.ts, undefined chatSectionsRoutes in register-plugins.ts, missing CompleteGenerationOpts in post-store.test.ts; plus the plan:sync --fix orphan-issue bug. All blocking the 0.1.0 tag per priority-release-010.md § Build Integrity Cluster. Typecheck green on dev; verify the trio + orphan fix landed, then close + retire open-build-integrity.md.

## Verify

1. bunx tsc --noEmit exits 0 on a clean checkout.
2. bun run plan:sync reports zero orphans for the four issue hashes.
3. The three BUG tickets (formerly in open-build-integrity.md) are all status:done in index.json.
4. open-build-integrity.md pointer stub is either retired (per the 2026-09-18 cluster-retirement precedent in open-closed.md) or annotated with the resolution evidence + commit refs.

**Acceptance Criteria:**

- [ ] bunx tsc --noEmit exits 0; output captured in ticket log.
- [ ] bun run plan:sync shows zero orphan issues from the build-integrity batch.
- [ ] All three BUG tickets in index.json show status: "done" with their respective git_issue hashes.
- [ ] open-build-integrity.md either retired (cluster cleanup) or annotated with the verification evidence; open-closed.md § Retired block updated.
- [ ] bun run check exits 0; size-strict gate green (size regression is a separate ticket — see TASK-backlog-size-strict-regression-recovery).

**Tags:** build-integrity, typecheck, plan-sync, retirement, release-010
**Related:** .plan/backlog/open-build-integrity.md, .plan/backlog/open-inflight.md § 2026-09-11, .plan/tickets/index.json, scripts/plan/sync.ts


git issue: 332c1aa
