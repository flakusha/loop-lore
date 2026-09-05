<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gmNotesSection injects shadow notes into all actors' prompts

**Status:** ✅ Resolved (already on dev, 2026-09-05)
**Priority:** high
**Effort:** Small

## Summary

src/assistant/prompt/sections/gm-notes.ts:92 enabled:()=>true with no GM-role authorization -> hidden shadow notes reach the LLM for every actor in every chat (status=hidden + expiry filtered :50-55,:82 but no role gate). Fix: gate on gm_config/role (assistantRole per-chat) before injection.

## Resolution

Already fixed in dev by `c95f2aec` (`fix(authz): harden generation control plane, shadow/whitenote, chat/entity/message authz`). Verified 2026-09-05 against current `dev` (`9b8c0222`):

- `src/assistant/prompt/sections/gm-notes.ts:98-112` — `gmNotesSection.build` parses `ctx.chat.gm_config.assistantRole`; shadow notes are only fetched when `isGmRole` (`assistantRole === "gm"`). Whitenotes remain unconditional (story-steering directives), per the spec.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
