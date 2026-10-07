<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federation authorization (who may publish an actor) undefined

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-activitypub-federation does not state who may publish a World or Channel as a fediverse actor. Security gap. Fix: add AC stating owner or admin plus a world-visibility precondition.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Definition (2026-10-04, p3-bugfix-2026-10-04)

The AC now exists in `FEAT-activitypub-federation.md` → Acceptance Criteria: publish
authorization = the actor's owner or an instance admin, with a world-visibility
precondition (private worlds not publishable). The authorization check itself is runtime
code that lands with that FEAT; this ticket recorded the missing definition and it is
now written down there.

**Resolved:** 2026-10-06 registry-driven close: git issue d50cdb6 (registry tip: fb352c23d Konstantin Fedotov Close issue)

## Closure (2026-10-05, federation resolution review)

RESOLUTION TYPE: **decision-only — documentation, no implementation.**

Policy is written down verbatim in `FEAT-activitypub-federation.md` → Acceptance
Criteria: "An actor may be published only by its owner or an instance admin, and only
when the world's visibility permits public exposure; private worlds are not publishable."
That is a real rule with both the authority half (owner or instance admin) and the
precondition half (world visibility), so the definitional gap this ticket recorded is
closed.

**No code implements it.** Grepping `src/` for a publish path
(`outbox|inbox|publishActor|WebFinger|webfinger|OrderedCollection`) returns only the
server-to-server mesh subsystem: `src/federation/outbox.ts`, `src/federation/fan-out.ts`,
the `mesh_outbox` retry queue (`src/db/migrations/038_mesh_outbox.ts`, sealed
`ContentEnvelope` retries, not AS2 activities) and the `federation.outbox-drain` cron in
`src/cron/jobs.ts:147`. There is no actor-publish route, no inbox/outbox route group, no
WebFinger/actor-document resolution, and no owner-or-admin authorization check anywhere
in `src/`. The check lands as runtime code with `FEAT-activitypub-federation`
(Not Started). Closing this ticket asserts the definition exists, not that the gate is
enforced.

One adjacent gate does exist and is default-deny, but it is character-scoped consent,
not this ticket's owner-or-admin publish rule: `assertFederationConsent`
(`src/characters/services/federation-consent.ts:67`) denies on a falsy flag and on a
missing character row (`getFederationConsent` returns false when the row is absent,
line 53), and it is called by `generateActivityPubKey`
(`src/crypto/activitypub-keys.ts:53`). Two limits, verified 2026-10-05: no route calls
`setFederationConsent` (grep over `src/routes` — no matches), and no production module
imports `activitypub-keys` (grep for the import — no matches), so nothing can currently
mint a signing key, let alone publish. `setFederationConsent` itself documents that it
does not check ownership and that authorization is the caller's job (line 79).

**Resolved:** 2026-10-05 registry-driven close: git issue d50cdb6 (registry tip: fb352c23d Konstantin Fedotov Close issue)
