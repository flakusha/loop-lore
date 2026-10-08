<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Wire the chat write path to fanOutContent as the production sender trigger

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Call `fanOutContent` after a chat message persists so the mesh actually has a sender.

**Context:**

`fanOutContent` (`src/federation/fan-out.ts:143`) has no production caller, so nothing seals content, nothing requests a reservation, and `mesh_outbox` is never written. The `federation.outbox-drain` cron (`src/cron/jobs.ts:147-157`) therefore calls `runMeshOutboxPass` on a permanently empty table — a retry queue for a sender that does not exist. `sealContent` (`src/federation/envelope.ts:41`) is likewise only reachable from this function.

The function already does the right work and needs no changes: probe-seal for hash and size (`:154`), select duplication targets (`:163`), per-target clearance gate (`:168-175`), `requestReservation` (`:177`), seal with the granted content key (`:185`), `pushEnvelope` (`:195`), and `queueOutboxRetry` on failure (`:200`).

The seam already exists. `runPostInsertChatEffects` (`src/routes/messages/post-insert.ts:25`) runs after message insert, already receives `config`, `chatId`, and `effectiveContent`, and already uses fire-and-forget for its advisory title call (`:35`). What it lacks is any federation step. Trigger shape depends on decision **D2** (review §5).

**Direction:**

1. **(assumption D2: per-chat opt-in, all trusted peers, no per-peer targeting.)** Add a federation step to `runPostInsertChatEffects` after `autoRenameChat`, guarded by `config.federation.enabled`.
2. Build `FanOutContent` with `{ id: messageId, content: effectiveContent, chatId }`. The `chatId` field is load-bearing: the clearance gate only runs when it is set (`fan-out.ts:168`), and omitting it silently replicates chat content with no consent check — the exact hole `BUG-fan-out-content-clearance-gate-is-opt-in-on-a-caller-supplie.md` describes.
3. Resolve the policy via `resolveDuplicationPolicy` (`src/federation/duplication.ts`) and the provider via `createMeshEncryption` (`src/federation/encryption.ts`) from `config.federation.meshPsk`.
4. Fire-and-forget with a `catch` that logs. A peer failure must never fail or delay the message write — mirror the existing `void titleUntitledChatFromFirstMessage(...)` pattern at `post-insert.ts:35`.
5. Do not pre-check consent. `authorizeChatExport` already denies; tolerate the denial rather than duplicating the gate.
6. Tests: consented chat → one reservation and one push per eligible target; failed push → `mesh_outbox` row; unconsented → nothing sent and the write still succeeds.

**Acceptance Criteria:**

- [ ] Persisting a message in a consented chat with two trusted peers produces exactly one reservation and one sealed push per eligible target
- [ ] A push failure writes a `mesh_outbox` row that `federation.outbox-drain` re-pushes on its next pass
- [ ] An unconsented chat sends nothing, and `POST /api/messages` still returns success
- [ ] An unreachable or refusing peer never causes the message write to fail or to hang
- [ ] `chatId` is always populated on the `FanOutContent`, asserted by a test so the clearance gate cannot be bypassed
- [ ] `federation.enabled = false` adds no measurable latency to the message write path
- [ ] `bun run check` green

**Dependencies:**

- `TASK-bootstrap-mesh-peers-from-config-federation-peers-at-boot.md` — no trusted peers means no duplication targets

**Related Tickets:**

- `TASK-add-consent-route-and-ui-to-grant-and-revoke-chat-federation.md` — **pairs with this ticket; ship them together.** This trigger is inert without a way to grant consent, and that route is inert without something to gate. Neither is a prerequisite for the other, so neither is recorded as a dependency.
- `TASK-add-federation-to-the-config-domains-list-so-config-federati.md` — `MESH_PSK` and peer list come from config
- `BUG-fan-out-content-clearance-gate-is-opt-in-on-a-caller-supplie.md` — the caller-side contract this must satisfy

**Out of Scope:**

- Fan-out for non-chat content (worlds, blog posts, locations) — the ActivityPub surface is separate
- Batching or coalescing multiple messages into one envelope
- Backfill of messages sent before the trigger landed
