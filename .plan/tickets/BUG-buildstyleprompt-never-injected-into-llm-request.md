<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: buildStylePrompt never injected into LLM request

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/generation/smart-regen.ts:45, generate-route/

**What**: No evidence stylePrompt enters request body.

**Fix**: Wire buildStylePrompt into the LLM request body for smart-regen.

**Source**: FEAT-014 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `3c09cef04` (`fix(smart-regen): drop dead stylePrompt, forward style from FE`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/generation/smart-regen.ts:1-44` — `buildStylePrompt` removed; module comment documents why a `stylePrompt` would lie to callers until the prompt-assembly path picks the style hint off the variant row's `idempotency_key`.
- `src/generation/generation-routes/regenerate.ts:108-114` — return path explicitly notes no `stylePrompt` is returned.
- Cross-references: `BUG-buildstyleprompt-result-returned-but-never-consumed` and `BUG-frontend-regeneratevariant-does-not-pass-style-to-api` are also ✅ Resolved (same commit).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
