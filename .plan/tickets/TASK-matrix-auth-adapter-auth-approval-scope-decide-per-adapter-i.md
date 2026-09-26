<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: MATRIX-auth-adapter-auth-approval-scope: decide per-adapter inbound scope for auth-approval

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-auth-channel-provisioning
**Tags:** matrix-gap, auth
**Context:** IM adapter inbound-scope decision AC7 (WAC3) across xmpp/irc/feishu/telegram; OTP-only vs approval-push per adapter.

## Summary

**Status:** open
**Priority:** medium
**Effort:** Small
**Summary:** matrix-authentication-channels AC7 (WAC3) is open: IM adapters (xmpp/irc/feishu/telegram) need per-adapter auth-challenge capability plus inbound command parsing parity; adapters lacking inbound routes deliver OTP-only, approval-push needs inbound. feishu/xmpp inbound scope undecided per adapter epic.
**Acceptance Criteria:**
- [ ] Per-adapter matrix (xmpp/irc/feishu/telegram): OTP-only vs approval-push decided
- [ ] auth-approval flag semantics pinned against src/integrations/adapter.ts capability registry
- [ ] matrix-authentication-channels.md AC7 row updated with per-adapter decisions
**Tags:** matrix-gap, auth
**Related:** src/integrations/adapter.ts, src/integrations/adapter.test.ts, src/group-chat/mention-parser.ts, .plan/matrix-authentication-channels.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
