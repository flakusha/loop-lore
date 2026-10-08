<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Local Multi-Instance Federation — Sender Wiring & Dev Harness

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** federation, multi-instance, mesh, sender, consent, dev-harness, config

## Overview

Make two loop-lore servers on one machine actually federate. The mesh **receiver** is built, mounted, and tested; the **sender** — the entire trust and replication path — has zero production call sites. Two healthy instances pointed at each other today exchange nothing, silently, because `mesh_peers` is never populated, chat consent can never be granted, and nothing ever triggers a push.

This epic makes federation structurally functional: bootstrap peers from config at boot, give users a consent surface, give the chat write path a sender trigger, persist delivered payloads so a received message survives the request, carry DEKs over the wire so encrypted chat spans instances, and provide a two-instance dev harness with a runbook plus an e2e that boots two real servers.

Evidence and full analysis: `docs/review/federation-local-multi-instance-review.md`.

This epic is the operator/dev enablement layer under `epic-instance-federation.md` (user-facing switching) and `epic-federation-swarm-sync.md` (transport, ActivityPub, CRDT swarm).

## Scope

### Sender Path — Making the Dead Code Live

- **Peer bootstrap.** `config.federation.peers` → `upsertPeer` (`src/federation/coordinator.ts:49`) during startup. Until `mesh_peers` has rows, `assertTrustedPeer` (`src/federation/sharing.ts:67-79`) denies every inbound `/api/mesh-*` request. This is the cheapest proof the mesh is real, but it is **one of four independent wires, not the root cause** — see "No single root fix" below.
- **Consent surface.** Authenticated route + UI control calling `grantChatFederationConsent` / `revokeChatFederationConsent` (`src/federation/clearance.ts:114,130`), closing the permanent default-deny in `authorizeChatExport` (`src/federation/clearance.ts:74-107`). Explicit opt-in only; never implicit.
- **Sender trigger.** After a chat message persists, run clearance → `fanOutContent` (`src/federation/fan-out.ts:143`) for that chat. This is the missing production caller; it also makes `sealContent` and the `mesh_outbox` retry queue reachable.
- **Payload persistence.** `mesh_deliveries` stores metadata only (`src/federation/delivery.ts:55-62`). Store the decrypted payload so received content is readable after the request completes.
- **DEK over the wire.** Expose `exportChatDekForPeer` / `importChatDek` (`src/federation/dek-rewrap.ts:73,184`) on the wire so `encrypted`-tier chats can span instances. The existing type-level clearance binding must be preserved — it is what makes the export path unbypassable.


### No single root fix

The five sender-path items above are **five independent wires, not a chain with one head**. Each one is a real gap that stops the others from mattering, but none is upstream of the rest in the sense of a root cause, and fixing any one alone leaves two instances exchanging nothing:

| # | Wire | Blocking gap | Alone, it does not… |
|---|---|---|---|
| 1 | Peer trust bootstrap | `upsertPeer` has no production caller → `mesh_peers` empty → receiver denies every envelope | make anything send |
| 2 | Consent surface | no route/UI calls grant/revoke → `authorizeChatExport` is permanently default-deny | unblock a sender that does not exist |
| 3 | Sender trigger | `fanOutContent` has no production caller → nothing seals, reserves, or pushes | make anything arrive — the receiver still 403s |
| 4 | Payload persistence | `mesh_deliveries` keeps four metadata columns (`src/federation/delivery.ts:55-62`); the decrypted body is dropped | make a delivery useful when none arrives |
| 5 | DEK transport | no wire route for export/import | affect the `standard` tier, which federates on wires 1–4 alone |

**Peer bootstrap (wire 1) is the smallest first step, not the fix.** It is the cheapest way to prove the mesh is real, and it is sequenced early for that reason — but the peer-bootstrap ticket on its own does **not** deliver a federating system. It yields a receiver that trusts its partners and then receives nothing. Wires 2, 3, and 4 remain required for plain content; wire 5 remains required for the `encrypted` tier.

### Local Multi-Instance Enablement

- **`DATA_DIR` env override** (`src/config/constants.ts:13`) so two instances get distinct state without per-var workarounds.
- **`federation` in the config `DOMAINS` list** (`src/config/load/constants.ts:23-38`) so `configs/config.federation.toml` stops being silently ignored.
- **Per-instance session isolation.** `ll_token` is set `Path=/` with no `Domain` (`src/routes/auth/shared.ts:96-102`); cookies are not port-scoped, so `localhost:3000` and `localhost:3001` share one cookie jar.
- **Editable federation config panel.** `federation` is absent from `EDITABLE_KEY_MAP` (`src/config/sections/menu-data.ts:11-24`), so inputs render disabled.
- **Two-instance dev harness.** Script/compose + runbook: distinct hostnames, distinct DBs, distinct `SERVER_PUBLIC_ORIGIN`, one shared `MESH_PSK`. Must state the migration-ordering caveat (D6 below).
- **Two-real-server e2e.** `src/routes/federation-transfer.test.ts` uses two in-memory DBs and forwards in-process, seeding `upsertPeer` by hand — the exact step production never performs. The e2e closes that hole.

### Spec Drift Correction

`docs/spec/federation-instance-switcher.md` references two files that do not exist (`src/views/partials/top-bar.html`, `src/frontend/alpine/command-palette.ts`) and specifies a `federationStoreFactory` shape that does not fit the store registry (which maps name → initial value, not factory — `src/frontend/stores/index.ts:10-33`). Correct the spec; do not re-scope the switcher itself.

### Explicitly Out of Scope

- **ActivityPub / Fedify** — `epic-federation-swarm-sync.md`, `FEAT-activitypub-federation.md`.
- **CRDT swarm reconciliation** — `FEAT-swarm-mode-reconciliation`.
- **Radicle** — separate epic.
- **Messaging bridges** (Matrix/XMPP/IRC/Discord) — `epic-social-hub.md`, `epic-im-integrations.md`.
- **Mastodon-style account migration / `@user@instance` handles** — `epic-instance-federation.md`.
- **The instance-switcher UI itself** — already ticketed as `TASK-federation-instance-switcher-in-frontend-travel-between-inst.md`. This epic references it and only corrects its spec's drift; it does not re-ticket or re-implement the switcher.
- **Leader election for migrations** — `docs/spec/multi-instance-reconciliation.md` / `epic-multi-instance-reconciliation.md`. This epic documents the safe ordering as a runbook step instead.

## Architecture Sketch

```
src/federation/
├── coordinator.ts        # upsertPeer — now called at boot from config.federation.peers
├── clearance.ts          # grant/revoke consent — now reachable via a route + UI
├── fan-out.ts            # fanOutContent — now called from the chat write path
├── delivery.ts           # receiveDelivery — gains payload persistence
├── dek-rewrap.ts         # export/import DEK — now exposed on the wire
└── outbox.ts             # mesh_outbox retries — finally has rows to drain

src/routes/
├── federation.ts         # read endpoints: nodeinfo, /api/instance-state
├── federation-mesh.ts    # mesh receiver: /api/mesh-reserve, /api/mesh-deliver
├── federation-mesh-retract.ts  # POST /api/mesh-retract
└── <new module>          # + consent routes, + DEK export/import routes

dev/federation-local/     # two-instance harness: compose + runbook + env recipes
```

Boot sequence: load config → `federation.enabled` gate → upsert peers from `config.federation.peers` → start gossip cron. Sender sequence: persist message → `authorizeChatExport` (default-deny unless consented) → `fanOutContent` → reserve → seal → push (or queue a `mesh_outbox` retry on failure).

## Dependencies

- `epic-instance-federation.md` — user-facing instance switching; consumes peers this epic bootstraps.
- `epic-federation-swarm-sync.md` — mesh transport, gossip, SPKI pinning.
- `epic-mesh-federation-content-sharing.md` — the reservation/duplication/DEK design this epic wires into production.
- `docs/spec/multi-instance-reconciliation.md` — migration ordering; leader election deferred to it.
- `docs/spec/federation-instance-switcher.md` — switcher spec (drift corrected here).
- `epic-config-extensions.md`, `epic-config-file-separation.md` — config domains and layering.

## Testing Strategy

**Authorization is a first-class gate here, not a per-route afterthought.** Every function this epic wires into a route is currently actor-less, so an implementer who trusts the service layer will ship an IDOR. `docs/review/federation-local-multi-instance-review.md` §6 catalogues the exact gaps; the rules that follow from it:

- Every **new user-facing route** enforces authorization server-side, before the handler body, per resource — never per-route-only, never client-side-hidden. A chat id in a URL is a resource reference, not a capability.
- `grantChatFederationConsent` / `revokeChatFederationConsent` / `authorizeChatExport` (`src/federation/clearance.ts:74-107,114,130`) take **no actor**. They are content gates, not authorization gates. The owner check must be added in the route.
- `assertTrustedPeer` (`src/federation/sharing.ts:67-79`) authorizes a **peer**, never a user. It must not be used to satisfy a user-level check.
- Default-deny: unauthenticated → 401, wrong user → 403, untrusted origin → 403, absent config → no rows and no access.
- Each route's authorization gets an **explicit negative test** (IDOR case with two distinct users), and the e2e asserts the deny path, not only the happy path.
- Peer registration (`upsertPeer`) stays an operator-boot trust boundary and must not become request-reachable without its own authz.


- **Peer bootstrap:** boot with `config.federation.peers` set → `mesh_peers` rows exist → `assertTrustedPeer` accepts a configured origin and still rejects an unlisted one.
- **Consent:** default-deny holds with no consent; grant → export allowed; revoke → export denied again; non-owner cannot grant (decision D4).
- **Sender trigger:** persist a message in a consented chat → exactly one reservation + one push; a failed push writes a `mesh_outbox` row the drain cron re-pushes; an unconsented chat pushes nothing.
- **Payload persistence:** a delivered message is readable after the `POST /api/mesh-deliver` response completes, and the stored hash still matches the plaintext.
- **DEK:** an `encrypted`-tier chat federates; the receiving instance can `importChatDek` and read the content; a chat without clearance is still `tier-not-exportable`.
- **Config:** `configs/config.federation.toml` is actually loaded; `DATA_DIR` override relocates db/uploads/certs.
- **Isolation:** two instances on distinct hostnames hold independent sessions; the same browser tab does not see the other's session.
- **Two-real-server e2e:** boot two real servers on distinct ports/hostnames with distinct DBs and a shared PSK; a message federates end to end across HTTP. This is the acceptance test for the whole epic.

## Related Epics

- `epic-instance-federation.md` — user-facing switching + `@user@instance` handles; the layer above this one.
- `epic-federation-swarm-sync.md` — protocol/transport; ActivityPub + swarm CRDT (both out of scope here).
- `epic-mesh-federation-content-sharing.md` — the content-sharing design whose production wiring this epic completes.
- `epic-multi-instance-reconciliation.md` — leader-based reconciliation; owns migration leader election.
- `epic-config-extensions.md` — config domain + layering machinery touched by the `DOMAINS` and `DATA_DIR` work.
- `epic-frontend-admin.md` — owns the admin surface where peer management would eventually live.

## Related Tickets

- `TASK-federation-instance-switcher-in-frontend-travel-between-inst.md` — the switcher. Referenced, not duplicated.
- `TASK-federation-interconnect-peer-config.md` (Done) — built the `federation` config section. This epic wires it to `upsertPeer`; it is not re-ticketed.
- `TASK-mesh-coordinator-server-knowledge-db.md` (In Progress) — overlaps the peer-bootstrap area; coordinate rather than duplicate.
- `TASK-mesh-encrypted-content-sharing-reservation-duplication.md` (In Progress) — overlaps the reservation/DEK sender area; coordinate.
- `BUG-consent-toctou-revoking-a-chat-consent-during-a-fan-out-roun.md` — already-open consent race bug; the consent ticket here must not regress it.

## Open Decisions

Tracked as D1–D7 in `docs/review/federation-local-multi-instance-review.md` §5. The two that gate ticket shape: **D2** (what triggers fan-out — every message vs per-chat toggle vs per-peer targeting) and **D4** (who may grant consent — owner only vs any participant). Tickets are written to the review's stated defaults so they are actionable without a decision, and note the assumption.


## Finalization Handoff Hazard

These planning commits sit on a branch named `fix-unit-test-isolation`, which does **not** describe this content. The name matters at finalize time, not just cosmetically.

- Under `--merge-strategy squash` the commit subject is derived mechanically from the **branch name** by `branchToSquashMessage` (`node_modules/giwt/src/commands/finalize/merge.ts:22-37`), called from `node_modules/giwt/src/commands/finalize/staging-strategy.ts:31` with no override flag — `parseFinalizeArgs` (`merge.ts:56-113`) accepts `--merge-strategy`, `--onto`, `--force`, `--gates`, `--skip-gates`, `--plan-gates`, and `--jobs`, and nothing that sets the subject.
- For `fix-unit-test-isolation` this mints **`chore: Fix unit test isolation`** — a false description of federation planning.
- The default strategy is `rebase` (`merge.ts:67`), under which the branch name never lands in the commit subject.
- `AGENTS.md:379-381` recommends `--merge-strategy squash` for plan-only branches, so squash is the path a finalizer following the docs will take.

**Do not finalize this branch with squash under its current name.** Rename it to something matching the conventional-commit regex at `merge.ts:26` (`^(feature|fix|refactor|perf|docs|test|chore)/`) before finalizing. `docs/local-multi-instance-federation` matches and mints `docs: Local multi instance federation`. Alternatively finalize with the default `rebase`, where the branch name is not used.

### Expected gate failure

The `tickets` gate will be red at finalize time. The 12 federation `.md` files committed by the concurrent harness-research session exist on disk but are absent from this branch's `index.json` — classified as **`orphanFiles`**, which is **actionable/gating** (`sync-report.ts:21`). `orphanGitIssues` (advisory, `sync-report.ts:32`) is irrelevant here.

`runSync` returns `1` when `totalIssues > 0` (`sync-index.ts:297`: `return totalIssues > 0 ? 1 : 0`), and `totalIssues` includes `orphanFiles`. `checkTicketIndex` propagates this as an error finding (`content-gates.ts:227-233`).

This is **by design, not a defect**: `persistIndexCanonical` (`sync-index-write.ts:21-26`) intentionally skips index writes from a linked worktree — a worktree-local `index.json` would otherwise be `git add -A`-ed onto the feature branch and conflict at merge time.

The 12 fed files do not yet exist on `dev` at all (verified: 6 are absent from dev index entirely; 6 are present in dev index as phantom entries, meaning dev's index already had entries for them but dev's .md count never grew to match — these 6 are among dev's 336 phantom entries). `dev`'s `tickets` gate was already non-zero before these 12 files existed, due to 336 phantom index entries with no backing `.md` file. The 12 fed files are additive noise on the worktree gate specifically, not a new cause of dev failure.

**Post-merge follow-up required**: after the merge lands, run `giwt sync --fix` in the `dev` checkout to regenerate `dev`'s `index.json` and absorb the 12 new files. Without this, `dev`'s next finalize will also report `orphanFiles` for them.