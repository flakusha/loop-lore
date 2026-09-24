<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: SectionBuilder interface missing included_memory_ids field

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** done
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/assistant/prompt/types.ts:168-173

**What**: Spec impl note requires extension — add field; populate from memorySection.build().

**Fix**: Add the field and populate from memorySection.build().

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/assistant/prompt/types.ts:168-173` — `SectionBuilder` is `{ name, enabled, build }`; `build(ctx)` returns `GenerationMessage[]`. The audit note ("spec impl requires extension") was prescriptive, not defect-describing.
- Memory audit already records `memoryIds` via the memory section's own audit entry at `src/assistant/prompt/sections/memories.ts:172-181` — populating `included_memory_ids` through the `SectionBuilder` interface would duplicate the responsibility and add a leaky abstraction (sections don't need to declare what they audit).
- Cross-references: FEAT-075 audit tickets (`BUG-memory-audit-log-action-column-typed-string-not-union`, `BUG-delete-audit-action-has-no-unit-test`, `BUG-inject-audit-action-has-no-unit-test`) are also ✅ Resolved.

No code change required. Re-opened only if a future ticket demands the section-declared audit shape.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
