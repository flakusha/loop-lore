<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Async spill offload dir is a fixed CWD-relative path shared by every worktree

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:** `src/async/spill.ts` resolves a fixed `OFFLOAD_DIR` relative to the process CWD and nothing GCs it, so every worktree and every test process on the host shares one spill path.
**Context:** Surfaced during the browser flake investigation (BUG-browser-e2e-suite-flakes-under-concurrent-runs) as a candidate root cause, and ruled out there — that flake is a click/response-wait ordering race, proven by load-bearing reproduction. The hazard stands on its own: spilled async-store payloads from two concurrent suites can overwrite or read each other's files, and the directory grows without bound because nothing removes them. A raw SQL write through Kysely bypasses the offload path entirely, which is why the store only reports the inline body when it did not know about the offload (`src/async/store.ts:19-22`) — the collision is silent.

**Acceptance Criteria:**
- [ ] `OFFLOAD_DIR` is per-process and per-worktree (e.g. `os.tmpdir()`-based, or derived from the repo root), not CWD-relative and fixed.
- [ ] Spilled payloads are namespaced by the writing process/scope so concurrent runs cannot collide.
- [ ] Something GCs the directory, or spill files are removed after they are read.
- [ ] A test asserts two independent stores with the same DB do not share spill paths.
- [ ] Implementation complete.
- [ ] Tests passing.
- [ ] Documentation updated.

## Fix landed — worktree `fix-embeddings-orphan-cascade`

Fixed together with `BUG-test-async-store-offload-dir-fixed-path-race`; that
ticket carries the full write-up. In short:

- Criteria 1 and 2: `src/async/spill.ts` no longer exports a fixed `OFFLOAD_DIR`.
  It exports `SPILL_ROOT` (repo-local `.tmp/async-store`, still CWD-relative so
  worktrees stay separated) and `offloadDir()`, whose default is the per-process
  namespace `SPILL_ROOT/<pid>`. Concurrent runs therefore cannot collide on a
  path. `setOffloadDir()` is the test seam that lets each suite claim its own.
- Criterion 3: `pruneOrphanSpills` sweeps `SPILL_ROOT` and descends one level
  into every `<pid>` namespace, collecting files a dead process left behind —
  a scan of only the current namespace would never see them. Spilled bodies are
  already unlinked when their row is nulled, so that path needed no change.
- Criterion 4: a test asserts two independent namespaces cannot resolve to the
  same spill path, and all four `src/async/*test*.ts` files now own a unique
  `mkdtemp` directory with `afterEach` teardown.

Restart safety is unchanged: `readOffloadedBody()` resolves the absolute
`request_results.offload_path`, so a row written before a restart still reads
back afterwards.

The sweep also removes emptied per-process namespace directories, so the root's
entry count stays bounded rather than growing one directory per process that
ever spilled.

Note on the full unit suite: its failure count is nondeterministic (27 / 55 /
53 across three identical `bun test src/` runs on unmodified `dev`), so a
single-run-per-tree comparison cannot attribute those failures to this change.
`BUG-test-async-store-offload-dir-fixed-path-race` records the control
experiment that rules it out.
