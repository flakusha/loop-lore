<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Mesh cross-peer content dedup before byte reservation

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-content-hashing-distributed-integrity

**Summary:**

Have fanOutContent consult assets.content_hash and the peer probe before reserving bytes, so a peer that already holds the hash skips the envelope body.

**Context:**

Verified 2026-10-15:

- `assets.content_hash` exists and `src/federation/` ships sealed `ContentEnvelope`s (`envelope.ts`), DEK rewrap per peer (`dek-rewrap.ts`, `peer-keys.ts`), consent gates (`clearance.ts`), and byte reservations with retry (`sharing.ts`, `outbox.ts`, `fan-out.ts`).
- `fanOutContent` reserves bytes in `sharing.ts::outstandingBytes`. The hash arrives via a **separate probe call** (`fan-out.ts:180-182`), so a TOCTOU window exists between probe and reserve.
- The §14 gap list has **nothing** under missing mesh optimisations — verified: its Optimize row is about compression / format / LOD, and its rows are intra-instance reuse, not cross-peer.

**[INFERENCE] — synthesis, not verified behaviour:** because `assets.content_hash` exists *and* the mesh ships sealed envelopes, a peer that already holds the hash does not need the envelope body at all — only the metadata and the re-wrapped DEK. Filed as the cheapest available improvement to mesh fan-out. Treat as a proposal until an executed probe confirms it.

Companion epic `epic-mesh-federation-content-sharing.md` is **Done**, so this lands as a follow-on TASK rather than reopening that epic.

**Acceptance Criteria:**

- [ ] **Behaviour:** a fan-out to a peer that already holds `content_hash` skips the envelope body and sends only metadata plus the re-wrapped DEK; the plain path is unchanged.
- [ ] **Tests:** dedup hit; dedup miss; a peer that answers inconsistently between probe and reservation.
- [ ] **Edge cases:** hash present but DEK rewrap fails (must not reserve bytes for a body it will not send); a peer that falsely claims the hash (integrity check catches it — reservation aborts, it does not silently accept); zero-length content; peer disconnects mid-reservation.
- [ ] **Concurrency / TOCTOU:** probe→reserve collapses into a single reservation keyed on `(peer, content_hash)` so two concurrent fan-outs of the same content to the same peer cannot both reserve the full body; the reservation TTL must not outlive the probe result.
- [ ] **Security:** skipping the body must not skip consent — `clearance.ts` is consulted before the metadata is sent, not only before the body; a hash claim from an untrusted peer is **not** evidence of content possession.
- [ ] **Regressions:** `federation.test.ts`, `federation-transfer.test.ts`, `outbox.test.ts`, `sharing.test.ts` unchanged.
- [ ] **Repo gates:** `bun run check` green.
