<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: NSFW read-only status panel

**Status:** Done
 **Status Note:** All 7 ACs green — verified against src + scoped frontend tests 2026-10-30.
**Status:** Done (2026-10-30)
**Priority:** High
**Effort:** Medium
**Epic:** epic-nsfw-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Read-only NSFW status panel for the chat character, rendered in the chat's
right-hand Character Info panel beside the mood panel. Shows the character's
intimacy score per partner and their body stat bars.

## Context

`epic-nsfw-ui.md` (P0) has no frontend surface for the NSFW systems that
already exist on the server. This task is the read-only status slice: it
surfaces what the backend already computes and adds no mutating UI.

Backend sources (all already shipped):

- `GET /api/v1/chats/:id` returns `character_id` (the chat's first non-user
  participant) — the same source the RPG stats panel uses.

- `GET /api/v1/nsfw/intimacy/:actorId` returns `IntimacyPair[]` (camelCase:
  `actorId`, `targetActorId`, `score`, `unlockedThresholds`).

- `GET /api/v1/nsfw/body/:actorId` returns `BodyProfile` (`stamina`,
  `flexibility`, `sensitivity`, `endurance`, `sizeCategory`, `build`).

Both NSFW routes are owner-gated (`requireNsfwActorAccess`) and consent-gated
(`requireNsfwRouteAccess`), so a 403 means "not your character" — the panel
hides itself instead of showing an error.

## What to Implement

1. `src/frontend/alpine/nsfw-panel/api.ts` — two read-only fetch helpers
   returning a `NsfwFetchResult` (`ok` / `denied` / `failed`). The intimacy
   helper uses the LIST endpoint, never the pair endpoint: `getPair` INSERTS
   a zero-score row on read, the list is a pure SELECT.

2. `src/frontend/alpine/nsfw-panel/state.ts` — the `nsfwPanelState` Alpine
   mixin: resolve `character_id`, fetch both endpoints, map into
   `_nsfwIntimacy` / `_nsfwBody`. Never throws, never surfaces an error.

3. `src/frontend/alpine/chat-types/nsfw-state.ts` — the view-model types,
   folded into `ChatState`.

4. `src/components/chat/nsfw-panel.html` — the partial, mounted from
   `character-info-panel.html` via `{{> chat/nsfw-panel.html }}`.

5. `src/public/css/app.css` — the `.nsfw-*` styles, mirroring the mood panel.

The panel loads AFTER `loadParticipants()` in `_selectChatInner` so intimacy
pair targets resolve to participant display names without an extra request.

## Acceptance Criteria

- [x] Intimacy score, unlocked thresholds and partner display name render per pair
- [x] Body stat bars (stamina, flexibility, sensitivity, endurance) plus size/build render
- [x] A 403 from either endpoint hides the panel instead of rendering an error
- [x] A non-403 failure leaves the affected section empty and never throws
- [x] The panel renders nothing when the chat has no character
- [x] No mutating NSFW endpoint is called (list endpoint only — no row insert on read)
- [x] Unit coverage for both fetch helpers and the state mixin

## Files

- `src/frontend/alpine/nsfw-panel/api.ts` (new)
- `src/frontend/alpine/nsfw-panel/api.test.ts` (new)
- `src/frontend/alpine/nsfw-panel/state.ts` (new)
- `src/frontend/alpine/nsfw-panel/state.test.ts` (new)
- `src/frontend/alpine/nsfw-panel/index.ts` (new)
- `src/frontend/alpine/chat-types/nsfw-state.ts` (new)
- `src/frontend/alpine/chat-types/chat-state.ts`
- `src/frontend/alpine/chat-types/index.ts`
- `src/frontend/alpine/chat/inline-state.ts`
- `src/frontend/alpine/chat/world.ts`
- `src/frontend/alpine/chat/world.test.ts`
- `src/components/chat/nsfw-panel.html` (new)
- `src/components/chat/character-info-panel.html`
- `src/public/css/app.css`

## Caveats

- TOCTOU: N/A — read-only, no locks.
- Security: both endpoints stay owner/consent-gated server-side; the client
  never widens access. The panel hides on 403 rather than leaking whether the
  character exists.

- Authorization: the client resolves `character_id` from the chat, but the
  server re-checks ownership of that actor — the client is not the gate.

- Parallelism: the two NSFW reads are sequential; both are cheap local
  queries and each helper swallows its own error, so there is no rejection to
  lose.

- Partial failure: one failing endpoint leaves only its own section empty.
- Rollback: revert the commit — no schema, migration or API change.
- Stale state: the mixin clears `_nsfwIntimacy` / `_nsfwBody` on chat change
  and on the no-active-chat path.

- Data races: N/A — the panel loads once per chat selection.
- Idempotency: N/A — no writes. The intimacy LIST endpoint is a pure SELECT,
  so re-opening a chat cannot create rows.

- Observability: load failures are logged under the `nsfw-panel` child logger;
  they are never shown in the UI.

## Related

- `epic-nsfw-ui.md`
- `TASK-nsfw-body-state.md`
- `TASK-nsfw-frontend-integration.md`

**Context:**

The NSFW backend (intimacy pairs, body profiles) shipped without any frontend
surface, so `epic-nsfw-ui.md` stays P0-blocked on display. This ticket is the
read-only status slice: it renders what the backend already computes and adds
no mutating UI, leaving the mutating surfaces (action selection, consent
dialogs, partner selection) to their own tickets.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
