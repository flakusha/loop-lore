<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Async spill uses the idempotency cache key as a filename, so every routed id loses its body

**Status:** Not Started
**Priority:** high
**Effort:** Small

**Summary:** `spill()` joins the result-row id straight into a path, but that id is an idempotency cache key containing `/` and spaces, so the write lands in a directory that does not exist and the body is lost.

**Context:** Found while fixing BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s — a distinct root cause, which is fixed. That ticket removed the teardown race; a green browser run still logs exactly 2 `async-store write failed` lines, and those 2 are this defect, not that one.

`spill()` uses the result-row id verbatim as a **filename**: `path.join(OFFLOAD_DIR, `${id}.json.gz`)` (`src/async/spill.ts:30`). But that id is an idempotency cache key built by `makeKey()` (`src/middleware/idempotency-utils.ts:50`) as `${METHOD} ${routePattern} ${userId} ${requestId}` — it contains spaces and `/`. For any route pattern the key turns into a nested path whose parent directories do not exist, so `writeFileSync` throws `ENOENT`.

The failing ids are self-evidencing: `GET /api/v1/chats/:id/messages a0000001-0000-4000-a000-000000000000 87394d0f-...` — the route pattern is right there in the filename.

Nothing deletes these files. The spill dir is left untouched by both harnesses, the age floor in `pruneOrphanSpills()` holds at the real 24h default TTL, and the error reproduces identically at concurrency 1, 4, and 8. Earlier hypotheses (the orphan sweeper unlinking an in-flight spill, and one suite's sweeper reaping another's) were both disproved by direct experiment: a `pruneOrphanSpills(db, { ttlMs: 0 })` pass prunes hundreds of files, but at the production TTL it prunes 0, and a fresh file never enters the candidate set.

The blast radius is wider than the 2 log lines. Any request whose completed body exceeds `maxInlineBytes` (1 MB by default) and whose route pattern contains `/` — which is every route — loses that body: the drain catches the throw, logs, and swallows it, so the gate stays green.

**Fix shape:** the id must not reach the filesystem unsanitized. Deriving a safe, collision-resistant filename (hash, or encode the key) keeps the mapping from row to spill file intact, which `offload_path` on the row already records.

**Fix:** `spillFileStem(id)` — a SHA-256 hex digest — is the single source of truth for the filename. `spill()` and `offloadExists()` both route through it, so they cannot drift apart again. Reversal is unnecessary: the row's `offload_path` records the mapping.

**Acceptance Criteria:**
- [x] The spill filename is derived so no id can escape `OFFLOAD_DIR` or name a path that does not exist. — `spillFileStem()` hashes to a 64-char hex segment; `spill-filename.test.ts` covers `../../etc/passwd`, an absolute path, `..`, and `""`.
- [x] Distinct ids cannot collide onto one spill file (a route-pattern id and a plain-uuid id must not share a name). — asserted via `new Set([...]).size === 3`.
- [x] A regression test spills a body under a realistic `${METHOD} ${routePattern} ${userId} ${requestId}` id and asserts it is readable back. — `src/async/spill-filename.test.ts`, built from the real `makeKey()` rather than a hand-written string.
- [x] A green browser e2e run logs zero `async-store write failed` lines. — 277 pass / 0 fail, zero occurrences, against 2 before. The bodies now genuinely persist: the 4 spill files decompress to ~2 MB each.
- [x] Implementation complete.
- [x] Tests passing. — `bun test src/async/` 54 pass / 0 fail.
- [x] Documentation updated.

**Impact:** silent data loss for any response body above `maxInlineBytes` (1 MB default) on any route, hidden behind a swallowed log line. Not cosmetic: the body is simply never stored, and the response-status endpoint reports it as complete. Closes the open noise criterion on BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s.


git issue: 33718af
