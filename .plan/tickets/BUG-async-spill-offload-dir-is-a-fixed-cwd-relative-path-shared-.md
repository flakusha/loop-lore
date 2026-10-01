<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Async spill offload dir is a fixed CWD-relative path shared by every worktree

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:** `src/async/spill.ts` resolves a fixed `OFFLOAD_DIR` relative to the process CWD and nothing GCs it, so every worktree and every test process on the host shares one spill path.
**Context:** Surfaced during the browser flake investigation (BUG-browser-e2e-suite-flakes-under-concurrent-runs) as a candidate root cause, and ruled out there — that flake is a click/response-wait ordering race, proven by load-bearing reproduction. The hazard stands on its own: spilled async-store payloads from two concurrent suites can overwrite or read each other's files, and the directory grows without bound because nothing removes them. A raw SQL write through Kysely bypasses the offload path entirely, which is why the store only reports the inline body when it did not know about the offload (`src/async/store.ts:19-22`) — the collision is silent.

**Acceptance Criteria:**
- [x] `OFFLOAD_DIR` is per-process and per-worktree (e.g. `os.tmpdir()`-based, or derived from the repo root), not CWD-relative and fixed.
- [x] Spilled payloads are namespaced by the writing process/scope so concurrent runs cannot collide.
- [x] Something GCs the directory, or spill files are removed after they are read.
- [x] A test asserts two independent stores with the same DB do not share spill paths.
- [x] Implementation complete.
- [x] Tests passing.
- [x] Documentation updated.

## Fix landed — worktree `fix-embeddings-orphan-cascade`

Fixed together with `BUG-test-async-store-offload-dir-fixed-path-race`; that
ticket carries the full write-up. In short:

- Criteria 1 and 2: `src/async/spill.ts` no longer exports a fixed `OFFLOAD_DIR`.
  It exports `SPILL_ROOT` (repo-local `.tmp/async-store`, still CWD-relative so
  worktrees stay separated) and `offloadDir()`, whose default is the per-process
  namespace `SPILL_ROOT/<pid>`. Concurrent runs therefore cannot collide on a
  path. `setOffloadDir()` is the test seam that lets each suite claim its own.
- Criterion 3: `pruneOrphanSpills` sweeps `SPILL_ROOT` and descends one level
- Criterion 4: met by `src/async/offload.test.ts`, test "each process writes
  its own copy and neither sees the other's file" (describe "two independent
  stores on one database do not share a spill path"). It spawns two real
  child processes, points each at its own `mkdtemp` root via `setOffloadDir`,
  and has both spill the SAME row id — the filename is a pure function of the
  id (`spillFileStem()` hashes it), so a shared path would collapse two
  payloads into one file. It asserts the dirs differ, each file sits under its
  own namespace, both payloads read back intact, and neither namespace saw the
  other's write. Mutation-checked: forcing both children onto one root turns
  it red, and making the dirs differ while sharing the write path still turns
  it red on the containment assertion.
  All four `src/async/*test*.ts` files additionally own a unique `mkdtemp`
  directory with `afterEach` teardown.

  This criterion was NOT met by the earlier fix. The previous revision of
  this section claimed the non-sharing test existed when it did not:
  `offload.test.ts` "the default spill dir is a per-process namespace under the
  repo's .tmp/ root" only asserts path shape inside a single process
  (`path.basename(offloadDir()) === String(process.pid)`), which cannot fail on
  a collision between two processes. The test above is the first to exercise
  the two-process case.

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


## Resolution

Closed 2026-10-01 in worktree `fix-spill-criterion4-test` after an audit of the
landed fix. Criteria 1-3 were already met; criterion 4 was claimed but not
actually tested. Two changes:

- Added the two-process non-sharing test described above
  (`src/async/offload.test.ts`).
- Rewired `offload-daemon.test.ts` "a default sweep stays inside the directory
  this test owns". The sentinel was written under the repo's shared
  `SPILL_ROOT` while the sweep — `setOffloadDir` in that file's `beforeEach`
  points `spillRootDir()` at the test's own `mkdtemp` — scans the `mkdtemp`.
  The sentinel was unreachable, so `expect(pruned).toBe(0)` passed vacuously,
  and the flat `.json.gz` it created was transient residue in the shared repo
  dir. The sentinel now lives inside the swept directory and is referenced by a
  seeded row; un-referencing it makes the sweep prune it (`pruned === 1`),
  which is what makes the assertion load-bearing.

Not landed: worktree `tree/fix-async-store-offload-dir` (3 commits) solved the
same root cause with a different design — a single `LOOP_LORE_OFFLOAD_DIR` env
override, no pid namespace, and a sweep scoped to the current offload dir. It
conflicts in 8 files against dev and would remove the namespace-descent GC,
the empty-namespace reclamation, and the `spill()` ENOENT retry. Its own guard
test asserts `offloadDir() === <repo>/.tmp/async-store`, which cannot hold
against the pid-namespace design. Abandoned as a net regression.
