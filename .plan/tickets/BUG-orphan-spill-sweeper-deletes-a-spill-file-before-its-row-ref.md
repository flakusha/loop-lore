<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Orphan-spill sweeper deletes a spill file before its row references it

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Found while fixing BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s. Distinct root cause from that ticket, which is fixed.

`apply()`'s `complete` branch spills the body to disk (`src/async/apply.ts:144`) and only THEN records `offload_path` on the row (`src/async/apply.ts:161`). Between those two statements the file exists but no row references it, so `pruneOrphanSpills()` (`src/async/spill-retention.ts:23`) classifies it as an orphan and `unlinkSync`s it. The store's drain catches the resulting failure, logs `async-store write failed`, and swallows it — so a large response body is silently lost while the gate stays green.

The default cutoff is `now - 2 * ttlMs`, which normally makes a just-written file ineligible, so this needs a short-TTL config (the e2e harness runs one) or a long stall between spill and UPDATE.

Evidence: a `pruneOrphanSpills(db, { ttlMs: 0 })` pass issued between spill and UPDATE removed 230 unreferenced files, proving the sweeper treats in-flight spills as orphans. A green browser e2e run still logs exactly 2 `async-store write failed` lines with `ENOENT: no such file or directory, open '.tmp/async-store/GET /api/v1/chats/:id/messages <id>.json.gz'`, reproducible 3/3 on an unmodified tree.

**Acceptance Criteria:**
- [ ] The spill is not swept between `spill()` and the row that references it.
- [ ] A regression test drives a sweeper pass into that window and asserts the file survives.
- [ ] A green browser e2e run logs zero `async-store write failed` lines.
- [ ] Implementation complete.
- [ ] Tests passing.
- [ ] Documentation updated.

**Impact:** silent data loss for large response bodies (`maxInlineBytes` threshold and above) under a short TTL, hidden behind a swallowed log line. Same log noise this epic set out to remove.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
