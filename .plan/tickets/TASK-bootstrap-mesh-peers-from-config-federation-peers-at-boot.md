<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bootstrap mesh_peers from config.federation.peers at boot

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Populate `mesh_peers` from `config.federation.peers` during startup so a configured instance actually trusts its partners.

**Context:**

`upsertPeer` (`src/federation/coordinator.ts:49`) has no production caller, so `mesh_peers` stays empty on every boot. `assertTrustedPeer` (`src/federation/sharing.ts:67-79`) reads that table and returns `null` unless a row exists with `state = 'trusted'` — so every inbound `POST /api/mesh-reserve`, `/api/mesh-deliver`, and `/api/mesh-retract` is rejected, including from a correctly configured partner. This is the root failure of the whole mesh: everything else is downstream of it.

Config and DB already disagree: the gossip cron builds its trust list from `config.federation.peers` (`src/cron/jobs.ts:114-121`) while the database has never heard of those peers. `FederationConfig.peers` is `FederationPeerConfig[]` (`src/config/schema/federation.ts:47`) defaulting to `[]` (`src/config/schema-class/federation.ts:7-13`). `upsertPeer` is idempotent on `origin`, so re-running bootstrap every boot is safe — but it must not silently resurrect a peer an operator deliberately defederated. Decide that merge rule explicitly rather than inheriting whatever `upsertPeer` happens to do.

**Direction:**

1. Add a `bootstrapPeersFromConfig(database, config)` entry point in `src/federation/`, following the options-object param style in `.agents/references/recommendations.md`.
2. Iterate `config.federation.peers`, canonicalizing each `peer.origin` via `canonicalOrigin` (`src/federation/peer-fetch.ts:64-77`). Skip entries that fail to canonicalize — log a warning, do not throw.
3. Call `upsertPeer` per peer with `{ origin, state: "trusted" }`. Pick and document the merge rule for a row already present in another state.
4. Gate the whole pass on `config.federation.enabled`; when disabled, write nothing.
5. Invoke it from the boot sequence after config load and DB construction, before the cron scheduler starts. The composition point is alongside where `registerPlugins` (`src/app/register-plugins.ts:49`) receives `database` + `config`.
6. Unit tests in `src/federation/`: two configured peers → two rows; disabled → zero rows; unparseable origin skipped without throwing; boot twice is idempotent.

**Acceptance Criteria:**

- [ ] Booting with two origins configured in `federation.peers` yields exactly two `mesh_peers` rows with `state = 'trusted'`
- [ ] `assertTrustedPeer` accepts a configured origin and still returns `null` for an unlisted one
- [ ] `federation.enabled = false` writes no `mesh_peers` rows at all
- [ ] Booting twice with the same config does not duplicate rows and does not change final state
- [ ] A peer whose origin is not a valid http(s) URL is skipped with a warning; boot does not throw
- [ ] The merge rule for a pre-existing non-`trusted` row is documented in the PR description
- [ ] `bun run check` green

**Dependencies:**

- `TASK-add-federation-to-the-config-domains-list-so-config-federati.md` — the peer list is unreachable from a domain config file until `federation` is a registered DOMAIN
- `TASK-federation-interconnect-peer-config.md` (Done) — built the `federation` config section this ticket consumes

**Out of Scope:**

- Gossip-driven discovery that writes `mesh_peers` from remote advertisements
- Admin UI for viewing or changing peer state (see `epic-frontend-admin.md`)
- Peer removal / defederation semantics and the `revokeDekExportsForPeer` call site
