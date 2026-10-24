<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: importChatDek throws on chat_keys primary-key collision instead of degrading

**Status:** Done
**Priority:** low
**Effort:** Small
**Tags:** federation

**Summary:**

chat_keys.id is PRIMARY KEY and chat_id carries a UNIQUE index (src/db/migrations/001_init.ts:1678, 1999-2003); dek-rewrap.ts:195-205 declares onConflict only on chat_id, so an artifact whose keyId equals an existing chat_keys.id bound to a different chat violates the PK (not a conflict target) and the insert throws. A sender can craft colliding key ids to break DEK imports for chosen chats (persistent replication failure). No production ingestion path yet. Fix: onConflict on both chat_id and id, or pre-select and fall back to the existing row, or reject with a typed error. Executed evidence (2026-10-04): bun:sqlite probe - a colliding PK id on a different chat_id under on conflict(chat_id) do nothing throws UNIQUE constraint failed: chat_keys.id; a plain chat_id conflict is a silent no-op.

**Context:**

`chat_keys` has two unique constraints: `id` is the PRIMARY KEY and `chat_id`
carries a unique index (`src/db/migrations/001_init.ts:1678`, `:1999-2003`). The
import insert declared `onConflict` only on `chat_id`, so a collision on the
PRIMARY KEY was not a conflict target and SQLite raised
`SQLITE_CONSTRAINT_PRIMARYKEY: UNIQUE constraint failed: chat_keys.id`,
aborting the import for that artifact. The artifact arrives over the wire, so
the remote peer chooses the key id - the collision is attacker controlled.

Constraints: an existing row for the chat still wins (first import is
authoritative), and another chat's row must never be overwritten or borrowed -
the importing chat must not end up pointing at a key row that belongs to a
different chat. Alternatives considered: a composite conflict target
(`oc.columns(["id", "chat_id"])`) - rejected, SQLite has no unique index over
both columns and rejects that clause outright; rejecting the artifact with a
typed error - that still aborts the import for the targeted chat, which is the
defect; binding the import to the colliding row - that would hand the chat a key
row that belongs to another chat.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated


## Resolution

The SQL claim in the Summary is CORRECT and reproduces: the insert declared
`onConflict` only on `chat_id`, so a PRIMARY KEY violation on `id` was not a
conflict target and the insert threw `SQLITE_CONSTRAINT_PRIMARYKEY: UNIQUE
constraint failed: chat_keys.id`.

The previous Wontfix rested on two grounds. The first still holds; the second
does not:

1. `importChatDek` still has zero production callers - there is no inbound DEK
   wire route yet.
2. `keyId` is not free-form *for an honest sender*: `exportChatDekForPeer`
   returns the sender's own `chat_keys` row id, minted by
   `crypto.randomUUID()`. But the receiver's input is an artifact from the
   wire, not that helper's output - a remote peer chooses the bytes it sends.
   The "crafted colliding key id" of the Summary is therefore reachable as
   soon as a route lands, and it aborts the import for the targeted chat.

The fix is in the query, at the seam every import goes through:

- `src/federation/dek-rewrap.ts:221` - the conflict target is dropped
  (`.onConflict(oc => oc.doNothing())`), so the insert tolerates a collision on
  the PRIMARY KEY as well as on the unique `chat_id` index. A composite target
  (`oc.columns(["id", "chat_id"])`) cannot be used: SQLite rejects it with
  "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint",
  because no unique index spans both columns.
- `src/federation/dek-rewrap.ts:204` - the id is checked before the insert; if
  another chat already owns it, the DEK is materialized under a freshly minted
  local id (`:210`) instead of aborting the import. The other chat's row is
  never overwritten.
- `src/federation/dek-rewrap.ts:170` - the contract is documented: the returned
  id is the local `chat_keys` id, so a caller replicating messages must
  rewrite their `key_id` to it when it differs from `artifact.keyId`.

Regression test: `a colliding chat_keys.id does not abort the import`
(`src/federation/dek-rewrap.test.ts:324`). Before the fix it fails - the import
throws `UNIQUE constraint failed: chat_keys.id`; after the fix it passes and
asserts that the colliding row keeps its id and its key material, that the
imported DEK lands under a different, fresh local id for its own chat, and that
it still decrypts to the sender's DEK.

**Resolved:** 2026-10-24 registry-driven close: git issue 873fe9f (registry tip: 33a7e9360 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-IMPORTCHATDEK-THROWS-ON-CHAT)
