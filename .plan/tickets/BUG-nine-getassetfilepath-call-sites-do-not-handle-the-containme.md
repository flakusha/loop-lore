<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Nine getAssetFilePath call sites do not handle the containment throw

**Status:** Not Started
**Priority:** Critical
**Effort:** Medium
**Epic:** epic-security-sandboxing

**Summary:**

Commit 411091148 gave getAssetFilePath an @throws contract and updated exactly one caller. Every other production caller still treats it as total.

Evidence read on dev — src/assets/variant-path.ts:45 is the only call wrapped in try/catch. The nine unguarded sites are:

- src/assets/serve-raw.ts:88 (handleServeRaw)
- src/assets/serve-raw.ts:158 (handleDownload)
- src/assets/serve-handlers.ts:203
- src/assets/service/read.ts:47 — the existsSync check at :48 is now unreachable for an out-of-root row
- src/routes/assets.ts:157 — the existsSync-plus-continue guard at :158-161 sits AFTER the throw, so one tampered row aborts the whole batch download instead of skipping one asset
- src/assets/matting-routes.ts:120 and :135
- src/generation/matting/service.ts:176 — #readSourceFile's throw propagates uncaught
- src/crypto/key-rotation/re-encrypt.ts:167 — the surrounding try at :169 covers readFileSync, not the path resolution above it

This fails closed, so it is not a security regression: a tampered row produces a 500 where a 404 used to occur. The batch-download case is the one with real user impact.

Fix: either have getAssetFilePath return string | null and let callers skip (they already branch on existsSync), or wrap each site and map the rejection to the same 404/continue the caller already produces.

Source: .tmp/step-5/repository-review.md F8; .tmp/step-5/concurrent-session-collision.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
