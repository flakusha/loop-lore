<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federation identity mapping to local users undefined

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation AC says map fediverse or IM actors to loop-lore auth or session model without trusting foreign auth, but specifies no mechanism, schema, or shadow-account model. Blocks all federation. Fix: add federated_identities (actor_uri to local user_id, shadow or link) schema plus a resolution service; define trust boundary where foreign auth is never trusted and a local session is issued only on verified ownership proof. Reference epic-social-hub.md social graph and Kysely schema.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Definition (2026-10-04, p3-bugfix-2026-10-04)

Mechanism now specified in `FEAT-activitypub-federation.md` → "Federated Identity
Mapping": `federated_identities` (`actor_uri` PK, `local_user_id` FK → `users`,
`mapping_mode` link|shadow, `created_at`), plus the trust boundary — remote assertions
never grant local authority and a local session issues only on verified ownership proof.
Character consent remains covered by `src/characters/services/federation-consent.ts`.
The resolution service implementation lands with the FEAT.


## Closure (2026-10-05, federation resolution review)

RESOLUTION TYPE: **decision-only — the table is NOT implemented.**

Design is specified in `FEAT-activitypub-federation.md` → "Federated Identity Mapping":
table `federated_identities` with `actor_uri` (TEXT PRIMARY KEY), `local_user_id` (FK to
`users`), `mapping_mode` (`link` — remote actor attached to an existing local user after
ownership proof; `shadow` — auto-provisioned local account with no credentials), and
`created_at`. Trust boundary: "remote assertions (display names, self-declared identities,
activity `actor` fields) never grant local authority. A `federated_identities` row is an
addressing record only. A local session for a remote actor is issued solely on verified
ownership proof — an HTTP-signed request from the key material advertised by that actor's
resolved actor document/WebFinger — which upgrades `shadow` to `link`." All three required
pieces (columns, trust boundary, modes) are present, so the definitional gap is closed.

**Implementation absent — verified.** Grep for `federated_identities` across the whole repo
returns hits only in `docs/research/federation-messenger-email-integration-research.md`
and `docs/spec/integrations-architecture.md`; zero in `src/`. Likewise
`federated_identities|federatedIdentities|actor_uri|mapping_mode` over `src/` returns
"No matches found". `src/db/migrations/` holds 38 files (`001_init.ts` …
`038_mesh_outbox.ts`) and **no** migration creates `federated_identities`; nor does any
any of the 15 schema modules in that directory, nor the 195-line table union
`src/db/schema.ts`, nor the generated `src/db/schema-manifest.ts`. No resolution service exists in `src/`.

Carried by `FEAT-activitypub-federation` (Not Started), which owns the inbox resolution
service that looks up/inserts by `actor_uri`. Closing here records the decision; the
migration and resolution service have not landed.

**Resolved:** 2026-10-05 registry-driven close: git issue d6f2a94 (registry tip: 306b98448 Konstantin Fedotov Close issue)
