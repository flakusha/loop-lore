<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW gate fail-open: DB error and missing prefs default to allowed

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Closed (commit 49731047 — fix(nsfw): gate correctness cluster)
**Priority:** high
**Effort:** Medium

## Summary

src/generation/hooks/nsfw-hook.ts:68 bare catch{} around getEffectiveNsfw falls through to policy check on DB failure (fail-open). src/nsfw/moderation-service/overrides.ts:52 prefs?.nsfwEnabled ?? true defaults NSFW enabled when missing/corrupt. Length bypasses: nsfw-hook.ts:46 skips gate for content <=20 chars, moderation-hook.ts:110 skips scan <=10 chars (trivial evasion). Fix: fail-closed defaults (nsfwEnabled ?? false), no length exemption.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
