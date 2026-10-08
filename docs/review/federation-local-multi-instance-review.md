<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Federation: Local Multi-Instance Review

**Date:** 2026-10-07
**Scope:** Can two loop-lore servers run side by side on one machine and federate with each other, today?
**Worktree:** `fix-unit-test-isolation`
**Verdict:** The receiver side works. The sender side is unreachable. Two instances cannot currently exchange content at all.

## 1. Verdict

### What works

The mesh receiver is finished and correct. Every inbound leg is present, tested, and mounted:

- **Wire routes** — `GET /.well-known/nodeinfo`, `GET /nodeinfo/2.1`, `GET /api/instance-state`, `POST /api/mesh-reserve`, `POST /api/mesh-deliver`, `POST /api/mesh-retract` (`src/routes/federation.ts:51-53`, mounted at `src/app/register-plugins.ts:56`), all gated on `config.federation.enabled`.
- **Identity** — `canonicalOrigin` normalises peer origins for keying (`src/federation/peer-fetch.ts:64-78`).
- **Transport crypto** — PSK mesh cipher with per-sender inbound keys (`src/federation/cipher.ts`, `src/federation/peer-keys.ts`), SPKI pinning (`src/federation/spki-pin.ts`).
- **Reservation lifecycle** — grant / advance / expire (`src/federation/sharing.ts`).
- **LWW merge** — `receiveDelivery` applies `(clock, content_hash)` last-writer-wins with a stale short-circuit (`src/federation/delivery.ts:41-69`).
- **Duplication policy** — trusted / listed / none with per-world override (`src/federation/duplication.ts`).
- **Gossip + cron** — `federation.gossip` (`src/cron/jobs.ts:107-129`) with hourly resync and 2-minute outbox drain.
- **Schema** — `mesh_peers`, `mesh_negotiations`, `mesh_reservations`, `mesh_deliveries`, `mesh_inbound_keys`, `mesh_dek_exports`, `mesh_outbox`, plus `chats.federation_consented_at`.

If a row appears in `mesh_deliveries`, the rest of the stack works. The problem is that nothing ever produces that row.

### What is dead

The sender/trust path has **zero non-test call sites**. Every gate downstream of it is therefore permanently closed:

1. `upsertPeer` (`src/federation/coordinator.ts:49`) is never called in production → `mesh_peers` stays empty → `assertTrustedPeer` (`src/federation/sharing.ts:67-79`) denies **every** `/api/mesh-*` request. A receiver that has never bootstrapped its peers from config will reject every inbound envelope, including from a legitimately configured partner.
2. `grantChatFederationConsent` / `revokeChatFederationConsent` (`src/federation/clearance.ts:114,130`) have no HTTP route → `chats.federation_consented_at` is never set → `authorizeChatExport` (`src/federation/clearance.ts:74-107`) is permanently default-deny.
3. `fanOutContent` (`src/federation/fan-out.ts:143`) has no production caller → nothing ever seals content for push, nothing ever requests a reservation.
4. `exportChatDekForPeer` / `importChatDek` (`src/federation/dek-rewrap.ts:73,184`) have no wire route → end-to-end encrypted chat cannot span instances. The type-level clearance binding is correct and cannot be bypassed, which means this is missing plumbing, not a missing control.
5. `sealContent` (`src/federation/envelope.ts:41`) is likewise never called outside `fan-out.ts` and tests.

The only production outbound path is the `federation.outbox-drain` cron → `runMeshOutboxPass` (`src/federation/outbox.ts:127-215`) → `pushEnvelope`, which **re-pushes already-sealed `mesh_outbox` rows**. Nothing in production writes `mesh_outbox` rows in the first place — only the failed-push branch of `fanOutContent`, which is itself unreachable. The outbox is a retry queue for a sender that does not exist.

Net effect: the system is a receiver with no sender and no way to trust anyone. Point two healthy instances at each other and they will silently exchange nothing.

### What is missing

Nothing exists for local multi-instance operation. See §3.

### Test coverage is narrower than it looks

`src/routes/federation-transfer.test.ts` is the only two-instance coverage. It uses two **in-memory DBs** and forwards **in-process**: it calls `sealContent`, `requestReservation`, and `pushEnvelope` by hand. It bypasses `fanOutContent`, never runs the gossip loop, never crosses an HTTP boundary between two servers, and seeds `upsertPeer` itself — which is precisely the step production never performs. No test in the repo boots two real servers.

## 2. Evidence — dead-in-production call sites

Each symbol below was searched across `src/`; every hit is in a `*.test.ts` file or in the symbol's own definition site. Zero production callers.

| Symbol | Defined at | Production callers | Consequence |
|---|---|---|---|
| `upsertPeer` | `src/federation/coordinator.ts:49` | none | `mesh_peers` never populated → `assertTrustedPeer` (`src/federation/sharing.ts:67-79`) denies every inbound `/api/mesh-*` |
| `grantChatFederationConsent` | `src/federation/clearance.ts:114` | none | `chats.federation_consented_at` never set |
| `revokeChatFederationConsent` | `src/federation/clearance.ts:130` | none | same; no revocation path exists either |
| `authorizeChatExport` | `src/federation/clearance.ts:74-107` | none (only reachable from `fan-out.ts:168-170`) | permanent default-deny on chat export |
| `fanOutContent` | `src/federation/fan-out.ts:143` | none | no reservation request, no sealed push, no outbox row written |
| `sealContent` | `src/federation/envelope.ts:41` | `fan-out.ts:154,185` only | sealing exists only on the unreachable path |
| `exportChatDekForPeer` | `src/federation/dek-rewrap.ts:73` | none | no cross-instance DEK export; encrypted chat cannot federate |
| `importChatDek` | `src/federation/dek-rewrap.ts:184` | none | no inbound DEK import over the wire |
| `runMeshOutboxPass` | `src/federation/outbox.ts:127-215` | cron only | drains a table nothing writes |
| `receiveDelivery` | `src/federation/delivery.ts` | `src/routes/federation.ts` | reachable, but only for peers that pass `assertTrustedPeer` — i.e. never |

The single production root of the failure is `upsertPeer`. Everything else is downstream of a sender that has no trigger.

## 3. Two instances locally: today vs required

### Today

There is no supported way to run two loop-lore instances on one machine. The individual obstacles, all verified:

| # | Blocker | Evidence | Current workaround |
|---|---|---|---|
| 1 | `DATA_DIR` has no env override — hardcoded `path.resolve` | `src/config/constants.ts:13` | per-var overrides only: `SQLITE_FILENAME` (`src/config/sections/database.ts:11`), `ASSETS_UPLOAD_DIR` (`src/config/sections/assets.ts:10`). TLS paths (`src/config/sections/server.ts:16-19`) have no override. |
| 2 | **Auth cookie collision.** `ll_token` is set `Path=/`, no `Domain`. Cookies are not port-scoped (RFC 6265 §5.1.4, §5.2.3). | `src/routes/auth/shared.ts:96-102` | none. `localhost:3000` and `localhost:3001` share **one** cookie jar; logging into B clobbers A's session mid-use. **Distinct hostnames** (`a.localhost` / `b.localhost`) isolate correctly; distinct ports alone do not. |
| 3 | No config-file or env-prefix mechanism | `loadConfig(cwd)` `src/config/load/load.ts:37-38`; fixed `CONFIG_FILES` `src/config/load/constants.ts:13-19`; bare `process.env` `src/config/load/env.ts:17` | two separate CWDs, or a fully explicit env per process |
| 4 | `federation` is not in `DOMAINS` | `src/config/load/constants.ts:23-38` | `configs/config.federation.toml` is **silently ignored**. Only `config.toml` / `config.local.toml` / env vars reach the section. |
| 5 | No local-dev compose | `deploy/docker-compose.yml` is prod-only (requires `DOMAIN`, `ACME_EMAIL`); `deploy/Caddyfile.local` proxies a single origin | hand-run two processes |
| 6 | `INSTANCE_COUNT` guard is per-process | `src/config/load/safety.ts:19-38` | silent footgun — a guard meant to catch multi-instance mistakes does not see the second process |
| 7 | `SERVER_PUBLIC_ORIGIN` must be set per instance | `src/config/sections/server.ts:27` | unset → self-advertised origins are wrong and peers negotiate against the wrong origin |
| 8 | Migrations run on every boot, no leader election | `docs/spec/multi-instance-reconciliation.md` | two SQLite processes racing migrations is unsafe |
| 9 | Config UI federation panel is read-only — no `federation` key in `EDITABLE_KEY_MAP`, so inputs render disabled | `src/config/sections/menu-data.ts:11-24` | edit TOML by hand |
| 10 | No peer/instance admin UI | `src/views/admin.html` — zero mesh/peer/federation matches | raw SQL |
| 11 | Peers never bootstrap from `config.federation.peers` | `src/federation/coordinator.ts:49` has no caller | `INSERT` into `mesh_peers` by hand before the receiver will accept anything |

Items 1–4 and 7 are hard blockers: without them you cannot get two distinct instances pointing at distinct databases and distinct origins. Item 2 is the subtle one — it is not a config error and produces a symptom (random logouts) that looks nothing like its cause.

### Required

To reach "two instances federate":

1. **A real sender trigger.** Something in the chat write path must, after a message is persisted, run clearance → `fanOutContent` for the affected chat. Without this, items 3–5 of §1 stay dead no matter how much plumbing exists.
2. **Peer bootstrap at boot.** `config.federation.peers` → `upsertPeer` during startup, so a configured instance actually trusts its partners.
3. **A consent surface.** An authenticated route + UI control that calls `grantChatFederationConsent` / `revokeChatFederationConsent`. This is a security gate; it must be explicit opt-in, never implicit.
4. **Per-instance identity.** Distinct hostnames (not ports) — or a per-instance cookie name.
5. **Per-instance state.** `DATA_DIR` override, or explicit per-var overrides plus a documented recipe.
6. **A harness.** A dev script/compose plus a runbook that pins distinct hostnames, distinct DBs, distinct `SERVER_PUBLIC_ORIGIN`, and one shared `MESH_PSK`.
7. **An e2e that boots two real servers** — the gap the current in-process transfer test hides.
8. **Payload persistence** — today `mesh_deliveries` stores `content_id`, `origin`, `content_hash`, `clock` only (`src/federation/delivery.ts:55-62`). The delivered content is decrypted, hash-verified, dropped, and never stored, so a received message is not readable on the receiving instance after the request completes.
9. **DEK over the wire** so an `encrypted` chat can span instances rather than being `tier-not-exportable`.

## 4. Sequencing

Ordered by dependency, cheapest-first. The rationale is that each step makes the next one observable.

1. **Config plumbing** (`federation` in `DOMAINS`, `DATA_DIR` override). Pure config, zero risk, and without it nothing downstream is expressible.
2. **Cookie isolation.** Must land before the harness, or the harness produces flaky, misattributed logouts that will be blamed on federation.
3. **Peer bootstrap at boot.** This is the single change that flips the receiver from "denies everything" to "works". Smallest possible proof that the mesh is real.
4. **Sender trigger** (chat → clearance → `fanOutContent`). The missing production caller. Consent lands with it, because the trigger is useless without it.
5. **Payload persistence in `mesh_deliveries`.** Without it, federation delivers a hash and discards the message — the demo will appear to succeed while being useless.
6. **DEK rewrap over the wire.** Last of the sender work: it only matters once the plain path already works, and it touches the crypto surface.
7. **Editable federation config panel + admin peer UI.** Usability on top of a working mechanism.
8. **Two-real-server e2e.** Lands last deliberately — it is only meaningful once every prior step is real, and it is what keeps them real.

Two structural notes:

- **Consent must not be deferred past step 4.** `authorizeChatExport` is default-deny by design (`src/federation/clearance.ts:6-8`); wiring the sender without a consent surface would push content under a gate nobody can open, and the tempting shortcut is to weaken the gate. Don't.
- **The e2e last is a deliberate risk.** Without it, steps 3–6 could each "pass" their unit tests while the system remains non-functional — which is exactly the current state. The runbook is the interim mitigation; the e2e is the real fix.

## 5. Open decisions — need a human call

| # | Question | Why it blocks | Default if unanswered |
|---|---|---|---|
| D1 | **Cookie isolation mechanism**: per-instance cookie name (config key), hostname-scoped `Domain`, or dev-only recipe? | A cookie-name key is a config-surface change touching auth everywhere; the hostname recipe is free but depends on `*.localhost` resolving (it does on Chrome/Firefox, not on all resolvers or curl). | Dev-recipe only (distinct hostnames), no cookie-name change. Cheapest; documented limitation. |
| D2 | **What triggers fan-out?** Every message in every consented chat, a per-chat "share with instance" toggle, or a per-chat target-peer list? | Determines the consent UI shape and whether `authorizeChatExport`'s per-peer semantics need widening. | Per-chat opt-in + all trusted peers; no per-peer targeting. |
| D3 | **Is mesh replication user-visible on the receiving instance?** A separate "shared with me" surface, or injected into the normal chat? | Changes `mesh_deliveries` schema (needs an owning-chat FK if the latter) and the frontend scope. | Separate surface; no chat mutation from federation. |
| D4 | **Who may grant consent** — chat owner only, or any participant? | `authorizeChatExport` gates on `federation_consented_at` alone today; a participant-granted consent may leak owner content. Note `checkChatSettingsAccess` also admits `gm`, which is broader than "owner only" — see §6. | Owner only, and **narrow the helper or wrap it**, because the obvious reuse over-grants to GMs. |
| D5 | **`DATA_DIR` override vs per-var overrides.** | `DATA_DIR` is a `path.resolve` at module scope (`src/config/constants.ts:13`); making it env-driven touches every section default and the JSON-schema placeholder rewrite (`src/config/schema-class/json-schema/index.ts:36-47`). | Env override with the resolved-path default preserved. |
| D6 | **Migration safety for two processes** — leader election, or document "migrate first, then run both"? | Two SQLite processes racing DDL is a real corruption risk (`docs/spec/multi-instance-reconciliation.md`). | Document the sequence; defer leader election to the reconciliation epic. |
| D7 | **Is `config.federation.peers` the sole peer source, or does admin UI write it?** | Two sources of truth for `mesh_peers` vs config drift. | Config is authoritative at boot; UI is read-only until an explicit override is designed. |

## 6. Authorization gaps this review found in the code to be wired

Distinct from the dead-path finding: these are properties of the **existing** functions that the new routes will expose. They are not visible from the dead-path evidence alone, and an implementer following the tickets without reading them would reproduce the gaps.

| Function | Actor param? | What it actually enforces | Consequence if a route calls it directly |
| --- | --- | --- | --- |
| `grantChatFederationConsent` / `revokeChatFederationConsent` (`src/federation/clearance.ts:114,130`) | **No** — `(database, chatId)` | Nothing. `UPDATE chats SET federation_consented_at = ? WHERE id = ?` with no ownership predicate. | Any authenticated user could set or clear consent on **any** chat by id. An IDOR on the consent flag, which is exactly the gate that authorizes content egress. Owner check must live in the route; there is no service-layer defense. |
| `authorizeChatExport` (`src/federation/clearance.ts:74-80`) | **No** — `(database, {chatId, peerOrigin})` | Chat exists, tier is `standard`, `federation_consented_at` is non-NULL. | Proves nothing about whether the *caller* may act on that chat. It is a content gate, not an authorization gate. Must not be mistaken for one. |
| `assertTrustedPeer` (`src/federation/sharing.ts:67-79`) | Origin only | Row exists in `mesh_peers` with `state = 'trusted'`. | Peer-level trust. It answers "is this origin a trusted sender", never "may this user export this chat". Substituting it for a user check would authorize any peer to reach any consented chat. |
| `upsertPeer` (`src/federation/coordinator.ts:49`) | **No** — `(database, {origin, state})` | Writes the trust row. | Legitimate **only** as an operator-boot path. Becomes a privilege grant the moment it is reachable from a request — relevant because bootstrapping peers from config (ticket 1) is what makes it non-empty for the first time. |

The mesh receiver routes are already correct: `authorizeMeshPeer` (`src/routes/federation-mesh.ts:44-60`) canonicalizes the claimed origin (400) then requires a trusted peer (403), and it is default-deny because `mesh_peers` is empty in production today. Two consequences follow:

1. The security posture of the whole mesh **inverts** when ticket 1 lands. Until then the deny path is total; afterward it is real. The negative case (unlisted origin → 403) needs an explicit test in that ticket or the change is untested at exactly the moment it starts mattering.
2. Every new user-facing route must add its own **user**-level check. The available helper is `checkChatSettingsAccess` (`src/chat/service/access.ts:175`), which admits `admin.chat`, `chats.created_by`, `role_in_chat = 'owner'`, and `role_in_chat = 'gm'` (`:181-217`). Under decision D4 ("owner only") that is **too broad** — a GM could grant consent over the owner's objection. Reusing it unmodified would silently resolve D4 the permissive way. This is the one place where the obvious implementation is wrong.

None of these are vulnerabilities today, because none of the functions is reachable from a route. They are landmines that arm the moment the wiring tickets land, which is why they are recorded here rather than discovered during implementation.

## Related work

- `epic-instance-federation.md` — user-facing switching + `@user@instance` handles. Not this epic.
- `epic-federation-swarm-sync.md` — transport, ActivityPub, swarm CRDT. Separate surface.
- `.plan/matrix-federation-decisions.md`, `.plan/federation-swarm` matrix — decision records.
- `docs/spec/multi-instance-reconciliation.md` — leader-based reconciliation; the migration question (D6) is theirs.
- `docs/spec/federation-instance-switcher.md` — frontend switcher spec; its drift is catalogued in the new epic.
- `TASK-federation-instance-switcher-in-frontend-travel-between-inst.md` — the switcher; referenced, not re-ticketed.
