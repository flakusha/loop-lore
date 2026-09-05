<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gmNotesSection injects shadow notes into all actors' prompts

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

src/assistant/prompt/sections/gm-notes.ts:92 enabled:()=>true with no GM-role authorization -> hidden shadow notes reach the LLM for every actor in every chat (status=hidden + expiry filtered :50-55,:82 but no role gate). Fix: gate on gm_config/role (assistantRole per-chat) before injection.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
