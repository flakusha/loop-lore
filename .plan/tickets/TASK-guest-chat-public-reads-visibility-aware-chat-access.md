<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guest chat public reads: visibility-aware chat access

**Status:** Done
**Scope:** Guest Access epic Phase 2: visibility-aware chat reads for the guest tier
**Priority:** high
**Effort:** Medium
**Epic:** epic-guest-access

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

`chats.visibility` is now read by the shared access guard, so the guest tier and any authenticated stranger can read `visibility=public` chats while private/unlisted stay participant-only.

- `src/chat/service/access.ts`: `checkChatAccess` takes `userId: string | null`, selects `chats.visibility`, and grants read on `ChatVisibility.Public` for any caller (guest: `userId` null with the `guest` role holding `chat.join`; registered-public: any authenticated `userId`). A null `userId` then short-circuits to `not_found` before the participant lookup, so a guest can never probe participation. `checkChatSettingsAccess` is untouched — settings stay write-gated.
- `src/chat/service/read.ts`: `getMessageWithAccess` mirrors the same public branch (it is the per-message read guard and cannot delegate to `checkChatAccess` without a second chat lookup).
- Routes (opt-in, one guard per shared function): `src/routes/chats/manage.ts` (`GET /api/chats/:id`), `src/routes/messages/read.ts` (all four read GETs) and `src/routes/chats/list.ts` (`GET /api/chats`) switched from `requireUserId` to `extractAuth`, so they hand the nullable user id to the guard. Every mutation route in the same files keeps `requireUserId`.
- Listing: `visibleToViewer` in `src/routes/chats/list.ts` gained a public arm (`chats.visibility = 'public'`); the creator/participant arms are dropped for a null user id, so a guest's list is exactly the public chats.

Why per-route opt-in: the Phase 1 precedent (`WorldAccessOpts.allowGuest` on `requireWorldAccess`) grants a tier only where the route opts in, because the shared helpers also authorize writes. The same rule applies here — the guard knows about the guest tier, the route decides to admit it. Widening `requireUserId` globally was rejected: it would have opened every chat mutation route in the same files.

Rejected alternative: a per-caller `allowGuest` flag on `checkChatAccess`. It would need one flag at every call site, duplicating what the null `userId` already encodes — a guest has no id, an authenticated user does.

Deviation from the original Change section: `visibility=unlisted` does **not** gain an id-reference read here; it stays participant/creator/admin-only (not discoverable, not listable, not readable by id). The id-reference arm was dropped because nothing in the read surface distinguishes "came by id" from "came from a list", so it would have made unlisted chats readable to guests by URL. The `public` arm is the only new read tier.

Also: the public branch widened `getMessageWithAccess`, which `PUT /api/chats/:id/messages/:id/visibility` used as its only gate — a stranger could have hidden a message in a public chat. `src/routes/messages/update.ts` now adds the author-or-`admin.chat` ownership check that DELETE/PATCH already had.

Tests: `src/chat/service/access.test.ts` (public read for guest and authenticated stranger, private/unlisted denied), `src/routes/chats/guest-visibility.test.ts` (new: guest lists only the public chat, public detail/messages readable, private and unlisted 404, authenticated stranger lists and reads public), `src/routes/messages/read.coverage.test.ts` (guest-open reads), `src/routes/messages/update.coverage.test.ts` (visibility write 403 for a non-author on a public chat).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue 747b486 (registry tip: 4d5d4a9c6 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GUEST-CHAT-PUBLIC-READS-VIS)
