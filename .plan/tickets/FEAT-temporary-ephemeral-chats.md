<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Temporary / ephemeral chats

**Status:** Not Started
**Summary:** Per-chat ephemeral mode — messages never persist (no DB/FTS/asset/memory rows); admin-enforceable switch.
**Context:** OpenWebUI `/temporary` chats (docs chat-features); searches `temporary chat|ephemeral chat|incognito|no-history|disappearing|off-the-record|unsaved` across `.plan/`+`src/`: 0 matches (2026-09-21 refs audit).
**Acceptance Criteria:**
- [ ] Ephemeral chat leaves no `messages`/`asset_links`/FTS rows after close
- [ ] Memory extraction + aux pipeline skip ephemeral turns
- [ ] Admin deny-switch blocks ephemeral mode with clear error
**Epic:** epic-chat-privacy.md
**Type:** Feature | **Priority:** Medium | **Effort:** M

## Problem

OpenWebUI ships temporary chats (unsaved, `admin-enforceable`, `/temporary` slash command — docs.openwebui.com/features/chat-conversations/chat-features; no local checkout persistence needed as evidence — behavior is doc+UI verified). Loop-lore has no equivalent: searches for `temporary chat|ephemeral chat|incognito|no-history|disappearing|off-the-record|unsaved` across `.plan/` and `src/` return zero matches (verified 2026-09-21 reference-platform gap audit).

## Change

- Per-chat `ephemeral` mode: messages render/stream normally but are never persisted (or are purged at chat close) — no DB rows, no asset linking, no memory extraction, no FTS indexing.
- Composer affordance (toggle or slash command); explicit "this chat is not saved" indicator (pairs with chat-privacy purpose/visibility columns).
- Admin enforcement switch: allow/deny ephemeral chats instance-wide (admin config schema + settings UI).
- Interacts with: encryption (skip or ephemeral keys), moderation (still moderate pre-persistence), telemetry (count but never log content).

## Acceptance

- Ephemeral chat: no `messages`/`asset_links`/FTS rows survive chat close (verified by DB inspection).
- Memory extraction + aux pipeline do not run for ephemeral turns.
- Admin deny-switch blocks entering ephemeral mode with a clear error.

## Non-goals

- Self-destruct timers on saved chats (chat-privacy spec scope).
