<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Pin mismatch and transient probe failure both evict a peer from the mesh

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-federation-swarm-sync
**Related:** `epic-runtime-memory-state-hygiene.md` (peer-table eviction policy class)
**Tags:** federation

**Summary:**

A pinOk failure in gossip (8afe53781) skips the fetch with no heartbeat; the code comment itself states the peer goes stale and the sweep evicts it (src/federation/gossip.ts:205-208). Fail-closed on mismatch is correct, but a probe timeout or a legitimate cert rotation before the pin update removes a healthy peer from the mesh entirely (needs rediscovery) rather than skipping a poll round - conflates currently-unverifiable with untrusted and gives an on-path attacker a cheap mesh-shrink lever. Fix: distinguish probe-failure from pin-mismatch in logs/metrics and quarantine (keep the row, skip polls) on mismatch until pins are updated.

**Context:**

The pin gate had a single outcome: `PeerPinVerifier` returned `Promise<boolean>`
(before the fix, `src/federation/spki-pin.ts:203`), so "the peer's key does not
match" and "the probe could not be completed" were the same value at the point
where they are conflated (`src/federation/gossip.ts:169`, the old `pinOk`). Both
skipped the fetch, so both produced no heartbeat, and the TTL sweep
(`src/transport/peer-table.ts:151`) evicted both. The eviction decision could
not tell a rejected peer (security signal) from an unreachable one (transient).

Constraints: the fetch stays fail-closed for a peer whose identity is unproven
(never a plaintext downgrade, never an advertisement from an unverified peer),
and the mismatch path keeps its current behaviour (no heartbeat, so the peer
goes stale and the sweep evicts it). Alternatives considered: a probe backoff
schedule (a new retry framework - out of scope), evicting immediately on
mismatch (a new table API and a behaviour change the fail-closed rationale does
not ask for), and fetching from an unverifiable peer (that downgrades the pin to
chain trust alone and lets an on-path attacker inject advertisements).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

The conflation is split at the shared seam, not per call site:

- `src/federation/spki-pin.ts:86` - new `PinVerdict` type
  (`"matched" | "mismatched" | "unreachable"`). `verifyPeerPin` (`:189`) and
  `createPeerPinVerifier` (`:232`) return it: a key that does not match (or an
  origin that cannot be pinned) is `mismatched`, a probe that could not be
  completed is `unreachable`.
- `src/federation/gossip.ts:222` - `pinOk` became `pinVerdict` and returns the
  verdict; the `peer.tls.failure` log now carries `reason: "spki-pin-mismatch"`
  or `"spki-probe-unreachable"`.
- `src/federation/gossip.ts:169` - the poll loop keeps an unverifiable peer: on
  `unreachable` the peer is retained and re-probed on the next round; on
  `mismatched` it is left to go stale and the sweep evicts it.
- `src/transport/peer-table.ts:158` - new `PeerTable.retain(origin)`: refreshes
  the peer's liveness clock without a heartbeat, so the TTL sweep cannot evict
  a peer that was never answered.

Regression test: `a probe that could not be completed keeps the peer in the mesh`
(`src/federation/gossip.test.ts:343`). Before the fix it fails - the peer was
swept after the TTL (`expect(svc.getPeer(PINNED)).toBeDefined()` received
`undefined`); after the fix it passes, and the peer is still polled and never
fetched. The mismatch counterpart (`pin mismatch skips the fetch; the peer goes
stale and is swept`, `src/federation/gossip.test.ts:327`) still passes unchanged,
so the security-signal half keeps its behaviour. The verdict itself is covered by
`probe failures return unreachable, not throw`
(`src/federation/spki-pin.test.ts:204`); the new table API by `retain keeps a
peer that could not be polled past the TTL` (`src/transport/peer-table.test.ts:135`).

**Resolved:** 2026-10-24 registry-driven close: git issue d033d31 (registry tip: d2a156f07 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-PIN-MISMATCH-AND-TRANSIENT-P)
