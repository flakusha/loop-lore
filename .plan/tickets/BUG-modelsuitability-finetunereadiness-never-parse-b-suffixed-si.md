<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: modelSuitability fineTuneReadiness never parse B-suffixed sizes

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Medium

## Summary

src/frontend/alpine/admin-models/logic.ts: modelSuitability/fineTuneReadiness parse paramSize with strict parseFloatOr, so real-world '8B'/'13B' size strings never parse and size tiers only trigger on plain numeric strings. Found during unit-test-coverage-2 (tests pin actual behavior with NOTE). Fix: strip B/M suffix with multiplier before comparing.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: shared.ts parseParamSizeOr B-suffix tiers; logic.test.ts:95-103.
