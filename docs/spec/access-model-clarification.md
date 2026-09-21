<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Access Model Clarifications

Status: Mixed — signed asset URLs and chat-scope moderation implemented; permission matrix, moderator program, command whitelist, and shared-link tiers not found in code.

## Implemented

- Signed asset URLs (was "Proposed" — now real): `src/assets/signed-url.ts` — HMAC-SHA256 over `action:assetId:expiresAt`, constant-time verify, default 900s expiry (not the proposed 1h); actions raw/download/thumb/compressed/matted; tests in `signed-url.test.ts`.
- Asset serving with auth — `src/assets/serve-handlers.ts`, `serve-raw.ts`, `controller.ts`.
- Encrypted-content primitives — `src/crypto/`: actor keys, chat keys, at-rest encryption, asset encryption, double-ratchet E2E (tier/inheritance semantics as written remain design).
- Moderation surfaces — `POST /api/chats/:id/moderate` (ban/kick/mute/flag) in `src/routes/chats/moderation.ts`; NSFW moderation service with flag queue, resolution, mod actions, audit log (`src/nsfw/moderation-service/`); admin permissions gate exists (`src/users/permissions.ts`, e.g. `admin.settings`).

## Not implemented / aspirational

- Chat permission matrix (Master/GM/Member/Observer, incl. an `observer` role) — no matching role code found.
- Site-wide Moderator/Admin role split with `/moderate` endpoints — only chat-scope + NSFW moderation exist.
- World command whitelist (`allowed_commands`, GM override, solo-mode bypass) — no code.
- Shared-link tiers (public token / standard auth / private key-escrow links) — no share-token surface found.

## Epics

- None dedicated. Nearest owning surfaces: `.plan/epics/epic-asset-platform-capabilities.md` (asset access + share hardening), `.plan/epics/epic-chat-privacy.md` (chat access/visibility).
