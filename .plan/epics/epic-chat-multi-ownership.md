<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Chat Multi-Ownership

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Filed 2026-10-30 from the 2026-10-30 operator direction: "this may be a cause for management/transfer/coauthorship/co-work". Generalizes the shipped single-owner transfer (`src/chat/service/ownership.ts`) to N concurrent owners. No prior plan doc anticipated co-ownership (verified: `rg -il "co-own|multi-owner|multiple owner|shared ownership" .plan/` → 0 chat-related hits). DEVIATION RESOLVED 2026-10-30 (ticket 4 cutover, operator decision): tickets 1–3 had temporarily retained the `created_by` flip in transfer because pre-existing tests pinned it; ticket 4 shipped the cutover — chat creation seeds the creator's `chat_owners` row, transfer no longer mutates `created_by` (frozen creator record; owners-set swap only), the `isChatOwner` fallback is dropped, and the single-owner call-site sweep now keys on the owners set. Tickets 1–4 Done (ticket 4: cutover + sweep verified — bun test src/chat/ src/routes/ 4649 pass / 89 skip / 0 fail; 6/7 gates pass, size-strict fails only on frontend-owned chat-types/core.ts); ticket 5 (frontend) in flight.
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** chat, ownership, access-control, moderation, audit

## Summary

Chats have exactly one owning user (`chats.created_by`, NOT NULL FK →
`users.id`). That one user is the only non-admin who may transfer the chat,
and every owner-scoped capability (settings, batch ops, polls, music-link
deletion, party split/reunion, hidden-message read) is a `created_by ===
userId` comparison. This epic introduces a co-owners model: a
`chat_owners` table holds the set of users with owner authority,
`chats.created_by` is retained as the creator (append-only), and the
existing transfer flow generalizes from a single-winner `created_by` flip
to add/remove operations on the owners set. Three operator-named angles
map onto the same primitive:

- **Management** — owner-level admin: any current owner (or admin) exercises
  the capabilities that today require `created_by === userId`.
- **Transfer** — generalize the single-winner conditional flip to N owners:
  per-row conditional writes on `chat_owners` inside one transaction, with a
  "never zero owners" guard.
- **Co-authorship / co-work** — multiple concurrent owners acting at full
  owner authority in the same chat.

## Current model (src-grounded)

- `chats.created_by` — single owner, NOT NULL FK → users.id
  (`src/db/migrations/001_init.ts:1763`, `src/db/schema-core.ts:687`),
  indexed `idx_chats_created_by`.
- `chat_participants` — PK `(chat_id, actor_id)`
  (`001_init.ts:1716`); `role_in_chat` ∈ {member, owner, observer, guest,
  gm} (`src/db/enums/enums-core/actors.ts:24`). A delegated
  `role_in_chat="owner"` row already grants settings access
  (`src/chat/service/access.ts:214-224`) but explicitly NOT transfer
  authority (`src/chat/service/ownership.ts:198-208`).
- Transfer — `transferOwnership` flips `created_by` conditionally on the
  previous owner (single-winner TOCTOU guard, `ownership.ts:52-61`),
  auto-invites with role owner, demotes the previous owner, writes one
  `log_entries` audit row (`event_type: "chat_ownership_transferred"`,
  `ownership.ts:91-107`), then best-effort `reconcileModeratorGrants`
  (`src/chat/service/access-moderation.ts:35-70`, keeps GM seats only for
  the ONE new owner) and 2 notifications (`ownership-events.ts:53-85`).
- Route — `POST /api/chats/:id/transfer-ownership`
  (`src/routes/chats/ownership.ts`).
- Frontend — ownership modal + `canTransferOwnership` mirrors the
  single-owner rule (`src/frontend/alpine/chat-settings/ownership.ts:144-153`,
  markup `src/components/chat/chat-settings-modal.html:888+`).
- Encryption/ACL is membership-driven (`chat_participants`), not
  owner-special: join/leave key distribution and rotation
  (`src/crypto/key-distribution.ts`) need no owner awareness beyond the
  auto-invite participant row the transfer already writes.

## Migration surface (every single-owner hard-code)

`checkChatAccess` (`access.ts:133`), `checkChatSettingsAccess`
(`access.ts:210`), `transferOwnership` authority + tx (`ownership.ts`),
`reconcileModeratorGrants` (`access-moderation.ts:55`), `read.ts:51`
(hidden-message read), `batch.ts:24,56,104` (owned-chat list/update/delete),
`polls.ts:247` (`isChatOwner`), `music-links.ts:224`, `split.ts:97,191-196`
(party split/reunion), `transitions.ts:55`, ownership notifications +
audit meta, the route, and the two frontend surfaces.

## Design

- **`chat_owners` table** — `id` PK, `chat_id` FK cascade, `user_id` FK
  users cascade, `granted_by` (users.id, nullable — admin grants),
  `granted_at`, `reason` (≤500 chars, nullable), UNIQUE `(chat_id,
  user_id)`. Migration `082_chat_owners.ts` (number picked against real
  `src/db/migrations/` HEAD at implementation time; HEAD is `081` as of
  2026-10-30) backfills one row per chat from `chats.created_by`.
  Append-only alterTable policy: one CREATE TABLE, no column churn on
  `chats`.
- **`chats.created_by` becomes creator-only** (append-only, never flipped
  by ownership operations again). Authority = membership in `chat_owners`
  seeded with the creator.
- **Owner cap** — `MAX_CHAT_OWNERS = 3` service constant (open decision:
  config knob vs constant; see Open Decisions).
- **Operations** (one service, same tx shape as today):
  - `addChatOwner` — any current owner or admin; participant/user
    resolution identical to the transfer path (actor → owning user);
    refuses at cap; refuses duplicates (bad_request).
  - `removeChatOwner` — any current owner may remove another owner;
    owners may remove themselves (resign); refuses when the target is the
    last remaining owner ("never zero owners").
  - `transferOwnership` (compat) — re-anchored as add-new + remove-self in
    one transaction; HTTP contract unchanged
    (`POST /api/chats/:id/transfer-ownership` body/response identical), so
    the existing frontend, route tests, and audit consumers keep working.
- **Concurrency** — per-row conditional writes (`DELETE … WHERE user_id =
  ? AND chat_id = ?`, guarded owner-count check inside the same tx).
  SQLite serializes writers; the single-winner pattern of the current
  conditional `created_by` flip generalizes row-wise. Concurrent
  last-two-owner removals: exactly one commits, the loser gets
  CONCURRENT_MODIFICATION (existing error channel).
- **GM seats** — `reconcileModeratorGrants` keeps GM for every user in the
  owners set, not one id.
- **Audit** — new `log_entries` event types `chat_owner_added` /
  `chat_owner_removed` with an owners-array meta; `chat_ownership_transferred`
  retained for the compat endpoint.
- **Notifications** — fan out to all remaining owners (add/remove events)
  and the affected user; the NotificationService per-user emit loop already
  supports this shape.
- **No access-layer rearchitecture** — one predicate helper
  (`isChatOwner(db, chatId, userId)`) + mechanical call-site swaps at the
  migration surface above. Role semantics unchanged: owner ⊃ gm ⊃ member
  for settings; transfer/ownership ops stay owner/admin-only.

## Tasks

- [ ] `TASK-chat-owners-schema-and-backfill` — migration + backfill + sync
      artifacts
- [ ] `TASK-chat-owners-service-owners-set-ops-generalizing-transfer` —
      owners-set service + generalized transfer + reconcile + audit +
      notifications
- [ ] `TASK-chat-owners-routes-and-compat-transfer-endpoint` — owner
      add/remove endpoints + compat transfer route + chat payload owner list
- [ ] `TASK-chat-owners-check-sweep-across-single-owner-call-sites` — swap
      single-owner call sites to the predicate + spec update
      (`docs/spec/chat-privacy.md` §5.1)
- [ ] `TASK-chat-owners-frontend-in-chat-settings` — owners management UI
      in chat settings

## Open Decisions (flagged, non-blocking)

- Owner cap value (3 proposed) and whether it becomes a config section
  knob (`src/config/sections/`) or a service constant.
- Whether `created_by` display semantics ("creator") need UI labeling, or
  whether the chat list keeps showing it as "owner" until the owners list
  ships in the payload.

## Dependencies

- Builds on the shipped single-owner transfer (`epic-chat-product-features.md`
  → `TASK-chat-feature-ownership-transfer`, Done): transfer service, route,
  modal, audit event, tests.
- No other epic owns chat access control; `epic-world-chat-channels-invites.md`
  owns world-level membership (different table), no collision.

## Related Epics

- `epic-chat-product-features.md` — shipped the single-owner transfer ticket this epic generalizes
- `epic-chat-privacy.md` — owner of the `docs/spec/chat-privacy.md` access rule this epic amends (§5.1)

## Follow-up: remaining route creator-checks (out of ticket-4 scope)

Deliberately untouched by the ticket-4 sweep; a follow-up ticket decides
whether each moves to the owners set:

- `src/routes/invites.ts` (invite create/list/revoke guard)
- `src/routes/story-turns.ts` (story-turns ownership guard)
- `src/routes/rpg/questions.ts` (questions ownership guard)
- `src/routes/messages/archiving.ts` (message archive guards)
- `src/routes/story-orchestration/index.ts` (GM lifecycle guards)

## Definition of Done

- All five tickets shipped; `bun test src/` green; `bun run check` green
- OpenAPI regenerated for new endpoints; `docs/spec/chat-privacy.md` §5.1
  updated to the owners-set rule
- Compat endpoint byte-identical HTTP contract (route tests unchanged
  except added owner-set assertions)
