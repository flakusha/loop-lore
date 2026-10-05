<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federation identity mapping to local users undefined

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
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
