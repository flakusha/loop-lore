<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: frontend regenerateVariant does not pass style to API

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/frontend/alpine/chat-variants.ts:100-119

**What**: Sends only {chatId, messageId} — add style param + picker.

**Fix**: Add a style parameter (with UI picker) and forward it to the regenerate API.

**Source**: FEAT-014 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `e15359ae4` (`feat(frontend): complete v1 endpoint migration`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/frontend/alpine/chat-variants.ts:100-119` — `regenerateVariant(messageId, style?)` forwards `body.style = style` to `/api/v1/generation/regenerate`. Inline comment cross-references `BUG-frontend-regeneratevariant-does-not-pass-style-to-api`.
- Backend (`src/generation/generation-routes/regenerate.ts:17-34`) accepts and validates `style: RegenStyle`.
- Cross-references: `BUG-buildstyleprompt-never-injected-into-llm-request` and `BUG-buildstyleprompt-result-returned-but-never-consumed` are also ✅ Resolved.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
