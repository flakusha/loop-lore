<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation offload: adopt dispatch in the remaining generation call sites

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

One real production call site now dispatches: the chat turn in
generate-route/stream-to-client.ts (TASK-federation-offload-adopt-dispatch-in-the-chat-turn-call-site).
That path was chosen because 'chat' is the only sticky workload class and the
chat id is a stable per-chat affinity key that already exists there.

Every OTHER generation path still calls scheduledCallWithFailover directly, so
those requests are never eligible for offload. This ticket tracks the rest.

Candidate sites to assess (confirm by reading, do not assume):

- generate-route/non-stream.ts — non-streaming chat generation
- src/turning/** — group/multi-actor turn advancement
- src/chat/** — any generation entry that bypasses generate-route
- aux pipeline and TUI generation paths — explicitly OUT of scope for now

Per site, the decision to make is which class applies:

- chat-class sites are eligible and should adopt dispatchChatGeneration
- stateless classes must keep affinityKey undefined so the key stays stable
  across a repeated request and reveals nothing about who asked

- anything the wire cannot represent (inline images, tool calls) must be
  confirmed to stay local rather than silently mangled

The structural rule from epic-federation-offload-quotas must hold at each new
site: a peer is NEVER added to buildFailoverList. A peer is not an LLMProvider.
Offload happens through dispatchPeerWorkload with the caller's existing
scheduledCallWithFailover thunk passed as local.

Add each site behind the SAME config gate (federation.enabled plus a declared
class), so the default path stays byte-identical and issues zero extra queries.

## Acceptance

- Each adopted site has a test asserting CONSUMER-VISIBLE behaviour, driving the
  real path rather than asserting on wiring: off means same response and same
  provider calls; on means the peer actually served it; a peer failure costs
  exactly ONE local retry; a peer that streams then fails never concatenates.

- Prove each test bites by breaking production code and showing the failure.
  A test that passes against a deliberately broken guard is not evidence.

- The chat affinity key used for stickiness is the chat's own id, not a
  freshly generated handle per turn.

## Caveats:

- TOCTOU: the stored pin is read before dispatch and re-written after. Two
  concurrent turns on one chat can interleave; confirm the last write wins
  without corrupting the audit trail of released assignments.

- partial failure: output a peer already streamed must never be concatenated
  with a local retry. Verify per call site what has already reached the client
  BEFORE dispatch — at the chat turn the peer's bytes legitimately reach the
  client as they stream, so the rule is 'nothing is appended', not 'nothing is
  shown'.

- rollback: each new site must be independently revertable. Removing one call
  site's adoption must not strand peers already pinned to it.

- stale state: a pin written by a removed call site is orphaned. Decide whether
  an unreferenced pin expires or is swept.

- observability: one structured log line per offload and per
  local-fallback-after-peer-failure, with no chat content in the log.

- authorization: the caller identity the peer admits is the instance origin,
  not per-user. Adding sites must not widen what a peer is trusted with.

- data races: the peer health/circuit state is process-wide. More call sites
  mean more concurrent attempts against one circuit.

- idempotency: a retried turn must not double-charge the peer or double-persist
  a message.

- lock/unlock lifecycle: none added; confirm no new lock is held across the
  network call to a peer.

- parallelism: sites may be adopted independently, but they share one config
  gate and one circuit, so parallel adoption makes failures harder to attribute.

- security: the bearer credential is read per dispatch. Confirm it is not
  logged, not persisted in the request payload, and not sent to a peer that
  failed closed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
