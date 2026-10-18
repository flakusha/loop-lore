<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation offload: adopt dispatch in the chat turn call site

**Status:** Done
**Resolution:** Shipped in ee0caad03: `dispatchChatGeneration` in `src/generation/generate-route/chat-peer-offload.ts` gates the chat turn in `stream-to-client.ts` on `config.federation.enabled` plus a declared chat class and hands the caller's `scheduledCallWithFailover` thunk to `dispatchPeerWorkload` as `local`. `chat-peer-offload.test.ts` 10 pass / 0 fail (`--isolate`), each mutation proven to bite.
**Priority:** high
**Effort:** Medium
**Epic:** epic-federation-offload-quotas
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Close the LAST MILE of federated workload offload: the feature was fully built
and tested, but nothing in production called it. A whole-repo search showed
dispatchPeerWorkload and runPeerWorkload were referenced ONLY from tests. Every
production generation path still called scheduledCallWithFailover directly, so
no real request was ever eligible for offload.

The composition point was simply not in the live path. This ticket wires ONE
call site, done properly.

## What shipped

src/generation/generate-route/stream-to-client.ts — the user's chat turn.
Chosen because 'chat' is the only sticky workload class and the chat id is a
stable per-chat affinity key that already exists at that site.

chat-peer-offload.ts is the new seam:

1. CONFIG GATE, no query: config.federation.enabled plus a declared chat
   class. Either false returns local() untouched.

2. Pure resolvePeerRoute over real peers / matrix / stored pin.
3. Decision local -> local(), the caller's unchanged
   scheduledCallWithFailover thunk, invoked once and unmodified.

4. Decision peer -> dispatchPeerWorkload with that same thunk as local.

A peer is NEVER added to buildFailoverList — the epic's structural rule that a
peer is not an LLMProvider holds. Affinity key is the chat's own id.

Off by default and byte-identical when off: the gate is reached before the
first DB read, so a default deployment issues zero extra queries.

A turn carrying inline images or tool calls stays local — the wire is
{ role, content } only and would silently mangle them.

Observability: one structured log line per offload and per
local-fallback-after-peer-failure, with no chat content in the log.

## The streamed-output risk, stated honestly

This call site passes its chunk handler straight through, so anything the peer
streams reaches the client AS IT STREAMS. If the peer then fails, those bytes
are already on the wire and cannot be taken back. What the epic's rule actually
guarantees here is narrower than 'nothing is shown': nothing is APPENDED. The
partial peer output is discarded rather than concatenated with the local
retry's, so the user sees a truncated reply plus an error frame — never two
generations spliced together. The local retry is suppressed entirely once
output has been emitted.

## Acceptance

Tests drive the real streamToClient against a real migrated SQLite DB and,
where a peer is eligible, a real federationRoutes app on a real loopback
socket. Each asserts CONSUMER-VISIBLE behaviour, not wiring:

- federation disabled: same response, same provider calls, and ZERO peer
  resolution queries (proven with a counting Kysely plugin, not by inspecting
  the decision)

- workloadOffload declares no chat class: local, peer untouched
- no matrix row for chat: local, peer untouched
- eligible peer with a matrix row: the PEER's own provider chain served it and
  the caller's chain never ran

- peer fails before streaming: exactly ONE local retry, complete response, no
  error frame

- peer streams then fails: partial reached the client exactly once, nothing
  appended, no done frame, caller's chain never ran

- stickiness reads the CHAT's pin: the pinned peer beats the matrix's first
  choice

- another chat's pin does not leak
- a turn the wire cannot carry stays local and writes no pin

Each mutation was proven to bite by breaking production code:

- removing the partial-output guard produced 'PEER-PREFIX LOCAL-ANSWER'
- calling local twice produced 2 local calls instead of 1
- reading the pin under a per-turn key instead of the chat's routed to the
  wrong peer

- weakening the enabled gate offloaded a request that must stay local

Note honestly: the affinity mutation did NOT bite on the first two attempts,
because the matrix routed identically and the two-peer test was decided by
ephemeral port ordering. It was made to bite only after the peers were given
deterministic origins, since the router's final tie-break is a string compare.

Remaining generation call sites are tracked separately in
TASK-federation-offload-adopt-dispatch-in-the-remaining-generatio.

## Caveats:

- partial failure: see the streamed-output risk above; the guarantee is
  'nothing is appended', not 'nothing is shown'.

- stale state: pins written here are keyed by chat. If this call site is
  removed, those pins are orphaned and need a sweep policy.

- TOCTOU: the pin is read before dispatch and re-written after. Concurrent
  turns on one chat can interleave; the last write wins and released
  assignments stay auditable on the same row.

- rollback: removing this adoption must not strand peers already pinned to it.
- authorization: the peer admits the caller by instance origin, not per user.
- security: the bearer credential is read per dispatch and never logged.
- security: fail closed — a host-local peer with no stored credential is not
  called, rather than spending the remote attempt on a certain 401.

- parallelism: sites sharing this gate share one process-wide circuit.
- idempotency: a retried turn must not double-persist a message.
- lock/unlock lifecycle: no lock is held across the peer network call.
- observability: one line per offload and per fallback, no chat content.
- data races: peer health state is process-wide and now advances on live turns.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
