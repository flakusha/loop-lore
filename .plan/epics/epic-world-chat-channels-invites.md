# EPIC: World Chat Channels & Invite-Driven Membership

**Status:** ✅ Complete (merged to dev: backend `95680e00`, frontend `d61ce737`)
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** worlds, chat, channels, invites, membership, access-control

## Overview

Non-RPG (chat-only) worlds organize chats Discord/Slack-style: locations act as
channel categories (1 location : N chats), and every chat in the world binds to a
static channel via `chats.current_location_id`. Access is a flat
`owner | admin | world_member | (public AND authenticated)` model with
invite-code redemption for membership — no per-channel ACLs, single-server,
no federation.

## Shipped

### Data Model & Migration (`033_chat_invites.ts`)

- `worlds.kind` (`'rpg' | 'chat'`) — chat-only worlds have no travel path
- `worlds.visibility` (`'public' | 'unlisted' | 'private'`, default `'private'`)
- `world_members` — flat membership, PK `(world_id, actor_id)`, no roles
- `world_invites` — mirror of `chat_invites`, code `UNIQUE`, `world_id` FK indexed

### Service (`src/chat/world-invites.ts`)

- `createWorldInvite` / `listWorldInvites` / `revokeWorldInvite` (returns
  `not_found` for missing/foreign, mirroring `chat/invites.ts`)
- `redeemWorldInvite` — inserts flat `world_members` idempotently
  (already-member → `{ ok, alreadyMember: true }`)

### Routes

- `POST/GET/DELETE /api/worlds/:id/invites` — owner/admin only
- `POST /api/world-invites/:code/join` — redeem into membership
- `GET /api/worlds/:id/chats` — grouped by location (channel category),
  participant-scoped
- `requireWorldAccess` widened to `owner | admin | member | public+auth`;
  list worlds includes member + public worlds
- SFW/NSFW gating stays on the existing `canAccessNsfw` chain

### Frontend

- world-edit **Invites** tab — create (optional max uses), copy, revoke codes
  (`src/frontend/alpine/world-invites.ts`)
- chat sidebar **join-by-invite-code** + world channel tree grouped by location
  (`src/frontend/alpine/world-channels.ts`, `chat-list-panel.html`)
- kind/visibility selects in world edit; 14 i18n keys in all 10 locales

## Tests

- Backend service tests (13) + route tests (`src/routes/world-channels.test.ts`)
- Frontend `world-channels.test.ts` (9) — grouping by location/`unlocated`,
  cross-world isolation, join flow (empty/success/already-member/server-error/
  network-error)
- Full suite: 3370 pass / 0 fail at merge time

## Out of Scope / Follow-ups

- i18n `kind` / `visibility` / invite keys are currently English in all 10
  locales (full translation deferred)
- No world member-removal UI — flat `world_members` exists; removal is
  backend-only
- No per-channel ACLs / roles (by design, single-server flat membership)

## Linked Tasks

- TASK-chat-only-world-channels-invite-driven-membership.md