<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Orphan-spill sweeper deletes a spill file before its row references it

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** `pruneOrphanSpills()` unlinks a spill file that `apply()` has just written but not yet recorded on its `request_results` row, silently losing large response bodies.

**Context:** Found while fixing BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s — a distinct root cause, which is fixed. That ticket removed the teardown race; a green browser run still logs exactly 2 `async-store write failed` lines, and those 2 are this defect, not that one.

`apply()`'s `complete` branch spills the body to disk (`src/async/apply.ts:144`) and only THEN records `offload_path` on the row (`src/async/apply.ts:161`). Between those two statements the file exists but no row references it, so `pruneOrphanSpills()` (`src/async/spill-retention.ts:23`) classifies it as an orphan and `unlinkSync`s it. The store's drain catches the resulting failure, logs `async-store write failed`, and swallows it, so the gate stays green while the body is lost.

The observed error is `ENOENT: no such file or directory, open '.tmp/async-store/GET /api/v1/chats/:id/messages <id>.json.gz'` — not the `RangeError: Cannot use a closed database` the teardown race produced, which is how the two were told apart.

The default cutoff is `now - 2 * ttlMs`, which normally makes a just-written file ineligible, so the window needs a short-TTL config (the e2e harness runs one) or a long stall between the spill and the UPDATE.

Evidence: a `pruneOrphanSpills(db, { ttlMs: 0 })` pass issued between the spill and the UPDATE removed 230 unreferenced files, proving the sweeper treats in-flight spills as orphans. The 2 residual log lines reproduce 3/3 on an unmodified tree, so they predate and are untouched by the teardown fix.

**Acceptance Criteria:**
- [ ] The spill is not swept between `spill()` and the row that references it.
- [ ] A regression test drives a sweeper pass into that window and asserts the file survives.
- [ ] A green browser e2e run logs zero `async-store write failed` lines.
- [ ] Implementation complete.
- [ ] Tests passing.
- [ ] Documentation updated.

**Impact:** silent data loss for response bodies above `maxInlineBytes` under a short TTL, hidden behind a swallowed log line. The remaining half of the log noise this epic set out to remove, so closing it also closes the open noise criterion on BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s.
