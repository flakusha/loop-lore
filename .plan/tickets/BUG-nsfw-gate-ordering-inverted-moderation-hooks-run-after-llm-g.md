<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW gate ordering inverted: moderation hooks run after LLM generation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** commit 49731047 — fix(nsfw): gate correctness cluster
**Priority:** high
**Effort:** Medium
**Epic:** epic-nsfw-moderation-priority.md
**Tags:** nsfw-moderation-priority

## Summary

NSFW/moderation hooks execute post-LLM at src/generation/auto-gen/auto-generation.ts:148-163. callLlm fires first (full cost), then runContentHooks gates storage; any streaming/effects added later leak ungated content. Pre-generation middleware (checkNsfwWithConsent, checkChatNsfwAccess) wired to nothing in generation paths. Fix: resolve gate pre-LLM; post-hoc hooks only as defense-in-depth.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
