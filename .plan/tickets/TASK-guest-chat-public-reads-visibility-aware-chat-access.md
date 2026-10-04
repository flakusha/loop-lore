<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Guest chat public reads: visibility-aware chat access

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-guest-access.md

**Summary:**

## Problem

chats.visibility (private/public/unlisted) exists but checkChatAccess (src/chat/service/access.ts) never reads it; non-participants get not_found regardless.

## Change

- checkChatAccess gains registered-public (any authenticated user) and open-public (guest) branches: visibility=public grants read; visibility=unlisted grants read only with an id reference (no listing).
- Chat listing for guests and authenticated non-participants returns only visibility=public chats.
- Private/unlisted stays participant/creator/admin-only.
- Registered users keep existing participant/admin access.

## Acceptance

- Guest lists/reads public chats, sees nothing else.
- Authenticated non-participant can read public chats and public worlds' chats.
- Unlisted not discoverable, not listable.
- Private chat read for non-participant still denied.
- checkChatSettingsAccess untouched (settings stays write-gated).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
