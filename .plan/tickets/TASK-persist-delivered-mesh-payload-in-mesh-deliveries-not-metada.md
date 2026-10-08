<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Persist delivered mesh payload in mesh_deliveries, not metadata only

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Store the delivered mesh payload in `mesh_deliveries` instead of only its metadata.

**Context:**

`receiveDelivery` (`src/federation/delivery.ts`) applies the `(clock, content_hash)` last-writer-wins short-circuit (`:41-53`), then upserts exactly four columns — `content_id`, `origin`, `content_hash`, `clock` (`:55-62`). The envelope is decrypted and hash-verified, then discarded. So once `POST /api/mesh-deliver` returns, nothing readable remains on the receiving instance: delivery reports success, a `mesh_deliveries` row exists, and the payload is gone.

This makes a working federation indistinguishable from a broken one at the point of use. Every other acceptance signal — 200 response, row written, LWW merged — passes while the feature delivers nothing. Where replicated content lands in the UI depends on decision **D3** (review §5).

**Direction:**

1. **(assumption D3: a separate shared-with-me surface, no FK to an existing local chat.)** Migration adding a nullable payload column to `mesh_deliveries`; follow `038_mesh_outbox.ts` conventions and regenerate `schema-manifest`.
2. In `receiveDelivery`, write the opened plaintext on both the insert path and the `onConflict ... doUpdateSet` path.
3. Leave the LWW short-circuit and hash verification exactly as they are. A stale envelope must be rejected **before** it can overwrite a newer payload — ordering matters here, so do not restructure the guard into the upsert.
4. Add a read accessor for the stored payload. The UI surface itself is out of scope; expose the data and stop.
5. Tests: payload retrievable and hashing to the sender's content; stale envelope does not overwrite; duplicate delivery is idempotent.

**Acceptance Criteria:**

- [ ] After `POST /api/mesh-deliver` returns 200, the payload is retrievable from `mesh_deliveries` and hashes to the sender's `content_hash`
- [ ] A stale envelope (lower clock, or equal clock with a lower hash) is rejected and does not modify the stored payload
- [ ] Re-delivering the identical envelope is idempotent — one row, unchanged payload
- [ ] The LWW guard is evaluated before any write, not merged into the upsert
- [ ] The migration is covered by a schema test; existing delivery and staleness tests stay green
- [ ] `bun run check` green

**Dependencies:**

- `TASK-wire-the-chat-write-path-to-fanoutcontent-as-the-production-.md` — nothing to deliver until the sender exists
- `TASK-bootstrap-mesh-peers-from-config-federation-peers-at-boot.md` — delivery is rejected without a trusted peer

**Out of Scope:**

- Building the shared-with-me UI surface (decision D3)
- Storing structured message objects rather than the opaque content string
- Federated delete / right-to-be-forgotten propagation across replicas
