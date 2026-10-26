<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: activitypub_actor_keys table and src/crypto/activitypub-keys.ts have no production reader

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 707ea1a): Ticket is a record-and-keep decision, not a code fix: acceptance criteria all checked in .md; src/crypto/activitypub-keys.ts still intentionally has zero production readers (groundwork for FEAT-activitypub-federation); nothing deleted, no drop migration added — state matches the ticket's own resolution.
**Priority:** low
**Effort:** Small
**Epic:** epic-crypto
**Tags:** federation, dead-code

**Summary:**

src/crypto/activitypub-keys.ts exports generateActivityPubKey, getActiveActivityPubKey and rotateActivityPubKey, and the activitypub_actor_keys table is created by src/db/migrations/001_init.ts:793 and declared at src/db/schema-manifest.ts:987. Grep for the table name and all three exported functions across src/ returns only: the module itself, the schema declaration, the migration, db/migrations.test.ts (FK cascade test), src/test-utils/insert-helpers.ts:951 (insertActivitypubActorKeys), and src/validation/db-schemas.ts:1049 (generated validator). No route, service, or job calls any of the three.

So the table ships with a migration, an FK, an index (idx_ap_actor_keys_actor_status, src/db/migrations/001_init.ts:1085) and encrypted-at-rest key material handling, and nothing in the running application ever reads or writes a row.

Why it is not simply dead weight: the key storage is a deliberate prerequisite for the unimplemented FEAT-activitypub-federation (status Not Started) and its own consent gate (src/characters/services/federation-consent.ts) is tested and wired into generateActivityPubKey. Removing the table before that FEAT lands would discard finished, tested groundwork.

Recommendation: keep the code, but land it behind FEAT-activitypub-federation. Until then it is inert. Confirm with knip that dead:code stays green and decide at FEAT time whether to keep the table or drop it -- the schema gate makes dropping it a migration, not a deletion.

This ticket exists to make the zero-reader state explicit and reviewed, so it is not rediscovered as an unexplained table during future federation work.

**Context:**

Re-verified against the current tree, not inferred from the ticket body:

- `src/crypto/activitypub-keys.ts` still exports `generateActivityPubKey`,
  `getActiveActivityPubKey` and `rotateActivityPubKey` and still has no
  production reader in `src/`; the `activitypub_actor_keys` table
  (`src/db/migrations/001_init.ts:797`, `src/db/schema-manifest.ts:1379`) is
  still unused at runtime.
- The module is not orphaned work, it is the deliverable of a closed ticket:
  BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-cry (Status:
  Done) added exactly this keypair storage and rotation for
  FEAT-activitypub-federation, and its acceptance criteria record the verified
  behaviour of `generateActivityPubKey` and `rotateActivityPubKey`.
- The planned feature still consumes it: FEAT-activitypub-federation (Status:
  Not Started) requires every activity to be signed with the actor key from
  `getActiveActivityPubKey` over `activitypub_actor_keys`
  (`.plan/tickets/FEAT-activitypub-federation.md:140-142`), and the consent gate
  in `src/characters/services/federation-consent.ts:84` is wired into key
  minting and tested.

So the "no production reader" observation is correct, but the premise that the
module and the table are dead weight is false: they are finished, tested
groundwork for a planned feature. Deleting them (and appending a migration that
drops the table) would discard that groundwork and contradict this ticket's own
recommendation and its Blocked-by note.

**Acceptance Criteria:**

- [x] Zero-reader state re-verified against the current tree (no production reader, the table has no runtime user)
- [x] The module's purpose traced to its own closed ticket and to FEAT-activitypub-federation
- [x] Decision recorded: keep the module and the table, delete neither, add no migration

## Blocked-by (2026-10-04, p3-bugfix-2026-10-04)

The missing production reader is `FEAT-activitypub-federation` itself — it owns actor
keys, inbox/outbox, and signature verification, and is currently Not Started. Until it
lands, `src/crypto/activitypub-keys.ts` (`getActiveActivityPubKey`) over the
`activitypub_actor_keys` table is the ready substrate: finished, tested groundwork
(consent-gated key minting), not dead weight. Resolve keep-and-wire vs drop when that
FEAT ships; do not remove earlier.

## Resolution (2026-10-24, re-verification)

The ticket's factual observation holds; the deletion premise does not. Nothing was
deleted and no migration was added.

Re-verified against the current tree:

- `src/crypto/activitypub-keys.ts` still has no production reader in `src/`; the
  only mentions are the module itself, the table
  (`src/db/migrations/001_init.ts:797`, `src/db/schema-manifest.ts:1379`), the
  generated validator and the test helper.
- The module is the deliverable of a closed ticket, not an orphan:
  BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-cry (Status:
  Done) added this keypair storage and rotation for FEAT-activitypub-federation
  and records the verified behaviour of `generateActivityPubKey` and
  `rotateActivityPubKey`.
- The planned feature still consumes it: FEAT-activitypub-federation (Status:
  Not Started) requires every activity to be signed with the actor key from
  `getActiveActivityPubKey` over `activitypub_actor_keys`
  (`.plan/tickets/FEAT-activitypub-federation.md:140-142`), and the consent gate
  in `src/characters/services/federation-consent.ts:84` is wired into key
  minting.

Deleting the module and appending a migration to drop the table would discard
finished, tested groundwork for a feature that is still planned, and would
contradict this ticket's own recommendation ("keep the code") and its
Blocked-by note ("do not remove earlier"). The zero-reader state is now
explicit and reviewed, which is what this ticket asked for.

Remaining work is blocked by FEAT-activitypub-federation: when that feature
lands, the module gets its production reader and the table stays. If the
feature is dropped instead, this ticket becomes a plain cleanup - delete the
module and its test file, and append a NEW forward migration that drops the
table (never edit an applied migration).

**Resolved:** 2026-10-26 registry-driven close: git issue 707ea1a (registry tip: 6c43e6d98 Konstantin Fedotov Close issue)
