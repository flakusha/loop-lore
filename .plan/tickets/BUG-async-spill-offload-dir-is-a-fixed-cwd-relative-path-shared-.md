<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Async spill offload dir is a fixed CWD-relative path shared by every worktree

**Status:** Not Started
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
