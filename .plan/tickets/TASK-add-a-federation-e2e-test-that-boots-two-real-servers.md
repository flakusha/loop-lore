<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add a federation e2e test that boots two real servers

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Add a federation e2e test that boots two real loop-lore servers and drives a message across between them.

**Context:**

`src/routes/federation-transfer.test.ts` is the only two-instance coverage, and it hides the production failure. It uses two **in-memory DBs** (`createTestDb()` called twice), forwards **in-process**, and calls `sealContent`, `requestReservation`, and `pushEnvelope` by hand (`:19-20,116`). It bypasses `fanOutContent` entirely, never runs the gossip loop, never crosses an HTTP boundary between two servers, and seeds `upsertPeer` itself (`:77-78`) — the exact step production never performs. That is how the whole sender path stayed dead while every unit test passed.

The technique needed already exists in this repo and is an accepted test pattern here: `Bun.serve` on an ephemeral port is used by `src/federation/peer-fetch.test.ts:26` and `src/server/start.test.ts`. It has simply never been applied to two federating loop-lore servers.

This is the acceptance test for the whole epic. It should be written last, once the sender path is real, because until then it would assert behaviour that does not exist.

**Direction:**

1. Boot two Elysia apps on ephemeral ports (`port: 0`) bound to `127.0.0.1`, each with its own SQLite DB — distinct `DATA_DIR` or distinct `SQLITE_FILENAME`, per `TASK-allow-data-dir-to-be-overridden-by-env-var.md`.
2. Configure each instance with the other as a trusted peer and one shared `MESH_PSK`.
3. Drive a real message through the **actual create-message path**, so both the `runPostInsertChatEffects` fan-out and the boot-time `upsertPeer` are exercised. Do not call `fanOutContent` or `sealContent` directly — that is exactly what the existing transfer test does wrong.
4. Assert the message is readable on the receiving instance once the deliver request completes.
5. No external network, no fixed ports, no sleeps longer than necessary. Prefer awaiting the delivery over polling.
6. Wire it into the suite that can tolerate real sockets; do not put it in the default `bun test` run if that run forbids `Bun.serve`.

**Acceptance Criteria:**

- [ ] Removing the `fanOutContent` call from the message write path makes this test fail
- [ ] Removing the boot-time `upsertPeer` call makes this test fail
- [ ] The message is readable on the receiving instance after `POST /api/mesh-deliver` completes
- [ ] Both servers run on ephemeral ports bound to `127.0.0.1` — no fixed ports, no external network
- [ ] The test exercises the real message-create route rather than calling federation internals directly
- [ ] Servers and DBs are torn down between runs; no state leaks into other suites
- [ ] `bun run check` green

**Dependencies:**

- `TASK-wire-the-chat-write-path-to-fanoutcontent-as-the-production-.md` — the sender must exist before it can be asserted
- `TASK-bootstrap-mesh-peers-from-config-federation-peers-at-boot.md` — peers must be trusted before delivery is accepted
- `TASK-add-consent-route-and-ui-to-grant-and-revoke-chat-federation.md` — the chat must be consented for anything to be sent
- `TASK-persist-delivered-mesh-payload-in-mesh-deliveries-not-metada.md` — needed for the "readable on the receiver" assertion
- `TASK-allow-data-dir-to-be-overridden-by-env-var.md` — two instances need two DBs

**Out of Scope:**

- Browser-level E2E through a real frontend (owned by `TASK-e2e-playwright-harness.md`)
- Gossip convergence under partition (belongs to the swarm epic)
- Replacing the existing in-process unit tests, which remain useful for fast feedback
