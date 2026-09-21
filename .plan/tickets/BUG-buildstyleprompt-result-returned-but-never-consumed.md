<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: buildStylePrompt result returned but never consumed

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/generation/generation-routes/regenerate.ts:108, src/frontend/alpine/chat-variants.ts:79

**What**: Returns stylePrompt — chat-variants.ts:79 ignores it.

**Fix**: Either consume buildStylePrompt in the request body or stop returning it.

**Source**: FEAT-014 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `3c09cef04` (`fix(smart-regen): drop dead stylePrompt, forward style from FE`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/generation/generation-routes/regenerate.ts:114-120` — return body no longer contains `stylePrompt`; comment explains why.
- `src/frontend/alpine/chat-variants.ts:100-119` — already forwards `style` to the API (commit `e15359ae4 feat(frontend): complete v1 endpoint migration` added the FE-side wire-up).
- Cross-references: `BUG-buildstyleprompt-never-injected-into-llm-request` and `BUG-frontend-regeneratevariant-does-not-pass-style-to-api` are also ✅ Resolved.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
