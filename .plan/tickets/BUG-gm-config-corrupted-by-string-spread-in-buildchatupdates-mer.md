<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gm_config corrupted by string-spread in buildChatUpdates merge

**Status:** ✅ Resolved (4835dcaf, 2026-09-04)
**Priority:** high
**Effort:** Medium

## Summary

PUT /api/v1/chats/:id with renderingOverride or gmConfig corrupts gm_config: fullChat.gm_config is TEXT, cast to Record and spread produces numeric-index garbage keys. Introduced in 1b9b0cdf merge logic; made reachable by a16490a7 (online VN presentation updates). Fix: safeJsonParse(fullChat.gm_config, {}) before spread in src/chat/service/crud/update.ts buildChatUpdates.

## Resolution

Fixed by `4835dcaf` (fix(chat): parse gm_config before merge; wire renderingOverride in new-chat; tighten gm-guidance authz). `buildChatUpdates` now parses `fullChat.gm_config` via `safeJsonParse<Record<string, unknown>>` before any spread, falling back to `{}` on missing/malformed. Regression tests added in `src/chat/service/crud/update.test.ts` (string-spread garbage + NULL gm_config).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
