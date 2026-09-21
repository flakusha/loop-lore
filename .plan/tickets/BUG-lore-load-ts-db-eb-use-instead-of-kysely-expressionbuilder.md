<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: lore-load.ts: db + eb use any instead of Kysely + ExpressionBuilder

**Status:** ✅ Closed (duplicate of `BUG-lore-load-ts-uses-any-for-db-eb-instead-of-kysely-expression`; same fix landed in `0da9d9b0`)
**Priority:** medium
**Effort:** Small
**Epic:** epic-lore-knowledge
**Summary:** Malformed duplicate ticket (HTML-stripped title, missing backticks, accidentally inlined a check-report banner during `/find-work` capture). Same fix as the canonical ticket.
**Context:** Captured by `/find-work` against `lore-load.ts`'s `db: any` + `eb: any` pattern; the parallel capture wrote a malformed markdown body. Resolved by closing without a separate commit.
**Acceptance Criteria:** Same as canonical ticket; resolve via cross-link and mark duplicate.

## Summary

This ticket was a malformed duplicate of `BUG-lore-load-ts-uses-any-for-db-eb-instead-of-kysely-expression`. Both captured the same `lore-load.ts` `any` typing violation; the canonical ticket landed the fix in `0da9d9b0`.

## Context

- Captured by `/find-work` against `lore-load.ts`'s `db: any` + `eb: any` pattern.
- The parallel capture wrote a malformed markdown body with HTML-stripped title, stripped backticks, and an accidentally inlined check-report banner.
- The canonical ticket (`BUG-lore-load-ts-uses-any-for-db-eb-instead-of-kysely-expression`) carried the fix; this duplicate is closed by cross-link.

## Acceptance Criteria

- [x] Same as canonical ticket — resolved in `0da9d9b0`.
- [x] Marked as duplicate and closed.

## Related

- `BUG-lore-load-ts-uses-any-for-db-eb-instead-of-kysely-expression` (canonical)

## Resolution

Closed as duplicate. The canonical ticket `BUG-lore-load-ts-uses-any-for-db-eb-instead-of-kysely-expression` carried the fix in commit `0da9d9b0` on branch `lore-lifecycle-followup`. No separate commit needed for this duplicate.
