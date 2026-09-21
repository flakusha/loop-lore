<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: memory injection reason not displayed in UI

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/frontend/alpine/memory-panel.ts

**What**: Frontend MemoryEntry lacks extractionKind — surface injection reason in panel and audit row.

**Fix**: Surface extractionKind/injection reason in the memory panel entry and in the audit row.

**Source**: FEAT-025 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `07bf3c5d1` (`fix(memory): drop dead stylePrompt; surface extractionKind in UI`) and `540e6427c` (`feat(memory-ui): create form type selector + injection reason`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/frontend/alpine/memory-panel.ts` — MemoryEntry surfaces `extractionKind` (injection reason) on the panel and audit row.
- Cross-references: `BUG-memory-create-form-hardcodes-episodic-type` is also ✅ Resolved (same commit cluster).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
