<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: modelSuitability fineTuneReadiness never parse B-suffixed sizes

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

src/frontend/alpine/admin-models/logic.ts: modelSuitability/fineTuneReadiness parse paramSize with strict parseFloatOr, so real-world '8B'/'13B' size strings never parse and size tiers only trigger on plain numeric strings. Found during unit-test-coverage-2 (tests pin actual behavior with NOTE). Fix: strip B/M suffix with multiplier before comparing.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
