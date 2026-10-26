<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Asset silent catch blocks swallow failures with no log

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue e31af47): Every cited site logs before its sentinel: serve-raw.ts:86,157; controller.ts:517-519; signed-url.ts:191; service/shares.ts:74; service/thumbnail.ts:63.
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-logging

**Summary:**

Seven catch blocks across src/assets/ return an error response or a null sentinel with zero logging, so every real failure (decrypt failure, malformed multipart body, DB error, sharp OOM, signed-URL verification bug) is indistinguishable from the expected case.

Evidence read on dev:

- src/assets/serve-raw.ts:83-85 — decrypt failure returns 500 'Failed to decrypt asset', no log. Same at :153-155.
- src/assets/controller.ts:512-516 — request.formData() failure returns 400, underlying cause discarded.
- src/assets/signed-url.ts:196-198 — catch returns { valid: false, reason: 'malformed' }; a bug in verification is indistinguishable from a tampered token.
- src/assets/service/shares.ts:72-74 — catch returns null `/* duplicate or FK failure */`, so a genuine DB outage looks like a duplicate share.
- src/assets/service/thumbnail.ts:59-63 — catch returns null, losing the sharp encode error.

Source: .tmp/longcat/review-consolidated.md nits 1,2,3,6,7,8; .tmp/longcat/review-assets-db-frontend.md N11,N12,N15,N16,N17.

Acceptance: each site logs the swallowed error via the module logger before returning its sentinel; the sentinel contract (null / 'malformed') is unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue e31af47 (registry tip: 91fdf380d Konstantin Fedotov Close issue)
