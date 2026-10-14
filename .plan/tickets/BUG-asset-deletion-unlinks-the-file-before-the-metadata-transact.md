<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Asset deletion unlinks the file before the metadata transaction commits

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

deleteAsset unlinks the on-disk file at src/assets/service/delete.ts:57, then opens the FK-cleanup transaction at :69-79. If the transaction throws, the metadata row survives and now points at a file that no longer exists. Derivative bytes are cleaned only after the record is gone (:83-85), so a failure there leaks files with no row to trace them back to.

Evidence read on dev:

- src/assets/service/delete.ts:57 — deleteFile(uploadDir, asset.storage_path,)
- src/assets/service/delete.ts:69-79 — the transaction
- src/assets/service/delete.ts:83-85 — derivative cleanup after the row is gone

Fix: commit the row deletion first, then unlink best-effort in reverse order, logging any unlink failure without aborting. A missing file on the read path already degrades to null (src/assets/service/read.ts:47-48), so a brief window with a row and no file is strictly safer than the reverse.

Note: the path-containment assertion inside deleteFile is itself correct as of commit 411091148, so this is an ordering problem, not a traversal problem.

Source: .tmp/cat-jam/review-memory-assets-rag.md P1 finding 1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
