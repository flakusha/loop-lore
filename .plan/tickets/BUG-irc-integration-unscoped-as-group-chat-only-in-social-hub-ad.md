<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: IRC integration unscoped as group-chat (only in social-hub adapter list)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** done
**Priority:** medium
**Effort:** Medium

## Summary

IRC (channels equal group chat, PM equals DM, RFC 1459 and 2812) is listed as `src/social-hub/adapters/irc.ts` in `epic-social-hub.md` but is absent from `epic-communications-integrations.md` and the federation epic. No ticket or scope exists.

**Fix**: scope IRC as a group-chat integration (channel equals group-chat, PM equals chat) under `epic-communications-integrations` or a new FEAT, reusing the consolidated chat or IM adapter (after the duplication ticket). Note: no E2EE, no auth model, needs bouncer or relay for persistence.

## Resolution

Closed as scope-discovery on 2026-09-15. The actual IRC implementation is a multi-day feature (RFC 1459/2812 protocol, no E2EE, requires bouncer/relay for persistence), not a bug fix — it cannot land in a single chat-work batch. Replaced by the `FEAT-2026-irc-group-chat-integration` ticket which carries the implementation scope. The scope ambiguity that motivated this BUG (`epic-social-hub` vs `epic-communications-integrations` placement) is resolved: the FEAT is filed under `epic-communications-integrations` per the ticket's own fix direction.

Verified:
- `src/social-hub/adapters/irc.ts` exists and is the only place IRC appears in `src/` (grep "irc" `src/` returns no other files in active code).
- No companion IRC ticket existed prior to this batch.
- `FEAT-2026-irc-group-chat-integration.md` created alongside this resolution.

## Acceptance Criteria

- [x] Scope documented and resolved via FEAT ticket handoff
- [x] FEAT ticket exists with full implementation scope
- [x] Epic placement clarified (`epic-communications-integrations`)
