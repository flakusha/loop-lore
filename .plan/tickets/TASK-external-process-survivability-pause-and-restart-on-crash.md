<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: External process survivability pause and restart-on-crash

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-local-process-swarm

**Summary:**

Add pause and bounded-backoff restart via child onExit to ServerExternalManager, plus extend the closed type union past the model family.

**Context:**

Verified 2026-10-15 by source read of `src/services/server-external-manager/`: well-factored — explicit `ServerExternalHost` handle, four `*-gaps.test.ts` files.

| Capability | State |
| --- | --- |
| Start / Stop / StopAll / hard-kill-on-exit | [OK] shipped |
| Poll | observe-only — 30s interval, logs a warning, nothing else |
| **Restart on crash** | **absent** — no `SIGCHLD`, no child `onExit` anywhere |
| **Pause / sleep** | **absent** — `stop()` is terminal and drops the instance |
| **Creative tools** | **absent** — `type` is a closed union of `llama-cpp` / `llama-swap` / `sd-cpp` |

llama-swap already owns `ttl` idle eviction, `/running`, `/api/models/unload[/:id]`, `/health`, `/metrics`, per-model logs, profiles and the swap matrix **for its own model family**, and proxies ComfyUI via `/comfyui/`. It cannot touch Blender / Krita / LibreOffice / GIMP / Inkscape. So this ticket owns lifespan + survivability **above both**, and the union extension — it must not duplicate llama-swap's model supervision.

Shape least likely to regress: extend the union, add `pause`, add bounded-backoff restart via child `onExit`.

**Acceptance Criteria:**

- [ ] **Behaviour:** `pause()` suspends a running external process without dropping its instance or identity; `resume()` restores it; `stop()` stays terminal and unchanged.
- [ ] **Behaviour:** an unexpected child exit triggers a restart with **bounded backoff** (attempt cap + delay); after the cap the manager reports failure rather than crash-looping silently.
- [ ] **Tests:** start→pause→resume→stop; crash mid-run triggers exactly one restart; repeated crashes hit the cap and stop retrying; restart does not orphan the old PID; SIGTERM still wins over restart (graceful shutdown must not restart).
- [ ] **Edge cases:** exit between the spawn call and the `onExit` registration (the race window — must not silently lose the exit); pause on an already-paused or already-exited process is idempotent; a child exiting `code 0` unexpectedly is still treated as a crash; `killAllSync` on server exit must not be defeated by a restart racing it.
- [ ] **Concurrency / TOCTOU:** pause and exit racing each other settle deterministically — never "restart after stop"; backoff state is per-instance, not global, so one flapping process cannot lock out the others.
- [ ] **Security:** a restart must not re-evaluate operator-changed config from a stale cached snapshot — re-read on restart or fail closed.
- [ ] **Regressions:** the four `*-gaps.test.ts` files still pass; `stop()` / `killAllSync` semantics unchanged.
- [ ] **Repo gates:** `bun run check` green.
