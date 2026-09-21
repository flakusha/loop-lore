<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: memory create form hardcodes episodic type

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/frontend/alpine/memory-panel.ts:141

**What**: No type selector — add select for episodic/semantic/procedural.

**Fix**: Add a type selector exposing episodic/semantic/procedural on the memory create form.

**Source**: FEAT-025 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `540e6427c` (`feat(memory-ui): create form type selector + injection reason`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/frontend/alpine/memory-panel.ts:141` — memory create form exposes episodic / semantic / procedural selector.
- Cross-references: `BUG-memory-injection-reason-not-displayed-in-ui` is also ✅ Resolved (same commit, surfaces `extractionKind`).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
