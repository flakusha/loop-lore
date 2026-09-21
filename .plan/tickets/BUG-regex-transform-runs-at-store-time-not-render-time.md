<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: regex transform runs at store time not render time

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/generation/auto-gen/store-message.ts:79; src/generation/auto-generation.ts:165

**What**: transformed flag at :51 returned but unused in auto-generation.ts:165.

**Fix**: Move regex transforms to render time and consume the transformed flag at the call site.

**Source**: FEAT-013 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `ffdeb0c22` (`fix(gen): move regex transforms to render time`) and `c54750320` (`fix(routes): apply regex transforms to list/export/search render paths`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/generation/auto-gen/store-message.ts` — store-time transform flag is no longer the source of truth; raw content is stored and transformed at render.
- `src/generation/auto-generation.ts:165` — consumes `transformed` flag (or render path now applies the transform on read).
- `src/routes/*` (list/export/search) — apply regex transforms at render time.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
