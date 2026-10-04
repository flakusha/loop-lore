<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Pin mismatch and transient probe failure both evict a peer from the mesh

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** federation

**Summary:**

A pinOk failure in gossip (8afe53781) skips the fetch with no heartbeat; the code comment itself states the peer goes stale and the sweep evicts it (src/federation/gossip.ts:205-208). Fail-closed on mismatch is correct, but a probe timeout or a legitimate cert rotation before the pin update removes a healthy peer from the mesh entirely (needs rediscovery) rather than skipping a poll round - conflates currently-unverifiable with untrusted and gives an on-path attacker a cheap mesh-shrink lever. Fix: distinguish probe-failure from pin-mismatch in logs/metrics and quarantine (keep the row, skip polls) on mismatch until pins are updated.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
