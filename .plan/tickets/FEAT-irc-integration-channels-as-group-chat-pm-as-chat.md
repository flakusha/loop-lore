<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: IRC integration: channels as group-chat, PM as chat

**Summary:** Scope IRC integration: channels map to loop-lore group-chat, PMs to 1:1 chat (RFC 1459 + 2812). No E2EE, no native auth model; persistence via bouncer or relay logging. BLOCKED on the consolidated chat/IM adapter (G16, git issue 476e62b); this filing closes the G18 scoping gap (git issue 27cc7ab).
**Context:** Scoped per matrix-protocol-chat-group-integration.md. Distinct from FEAT-2026-irc-group-chat-integration.md (which owns the adapter build): this ticket owns the scoping prerequisite and the adapter dependency. Canonical adapter home once unblocked: `src/social-hub/adapters/irc.ts`.
**Acceptance Criteria:** (1) G16 consolidated chat/IM adapter prerequisite (git issue 476e62b) resolved; (2) G18 scoping gap closure recorded against git issue 27cc7ab; (3) channel→group-chat and PM→chat mapping + no-E2EE/bouncer constraints carried into the build ticket.


**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Scoped per matrix-protocol-chat-group-integration.md. Map IRC channels to loop-lore group-chat and PMs to chat (RFC 1459 and 2812). No E2EE and no native auth model; persistence requires bouncer or relay logging. STATUS: BLOCKED - requires the consolidated chat or IM adapter (G16, git 476e62b) before any adapter code; filing closes the G18 scoping gap (git 27cc7ab).

## Acceptance Criteria

- [ ] G16 consolidated chat/IM adapter prerequisite (git issue 476e62b) resolved — adapter work unblocked
- [ ] G18 scoping gap closure recorded against git issue 27cc7ab
- [ ] Channel→group-chat / PM→chat mapping + no-E2EE/bouncer constraints handed to the build ticket (FEAT-2026-irc-group-chat-integration.md)
