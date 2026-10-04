<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: activitypub_actor_keys table and src/crypto/activitypub-keys.ts have no production reader

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** federation, dead-code

**Summary:**

src/crypto/activitypub-keys.ts exports generateActivityPubKey, getActiveActivityPubKey and rotateActivityPubKey, and the activitypub_actor_keys table is created by src/db/migrations/001_init.ts:793 and declared at src/db/schema-manifest.ts:987. Grep for the table name and all three exported functions across src/ returns only: the module itself, the schema declaration, the migration, db/migrations.test.ts (FK cascade test), src/test-utils/insert-helpers.ts:951 (insertActivitypubActorKeys), and src/validation/db-schemas.ts:1049 (generated validator). No route, service, or job calls any of the three.

So the table ships with a migration, an FK, an index (idx_ap_actor_keys_actor_status, src/db/migrations/001_init.ts:1085) and encrypted-at-rest key material handling, and nothing in the running application ever reads or writes a row.

Why it is not simply dead weight: the key storage is a deliberate prerequisite for the unimplemented FEAT-activitypub-federation (status Not Started) and its own consent gate (src/characters/services/federation-consent.ts) is tested and wired into generateActivityPubKey. Removing the table before that FEAT lands would discard finished, tested groundwork.

Recommendation: keep the code, but land it behind FEAT-activitypub-federation. Until then it is inert. Confirm with knip that dead:code stays green and decide at FEAT time whether to keep the table or drop it -- the schema gate makes dropping it a migration, not a deletion.

This ticket exists to make the zero-reader state explicit and reviewed, so it is not rediscovered as an unexplained table during future federation work.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
