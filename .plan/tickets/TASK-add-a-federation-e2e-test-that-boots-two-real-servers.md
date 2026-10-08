<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add a federation e2e test that boots two real servers

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

src/routes/federation-transfer.test.ts is the only two-instance coverage and it hides the production failure: two in-memory DBs, forwarding in-process, calling sealContent, requestReservation, and pushEnvelope by hand, and seeding upsertPeer itself - the exact step production never performs. It bypasses fanOutContent entirely and never runs the gossip loop. No test boots two real servers, which is how the whole sender path stayed dead while every unit test passed. Add an e2e that boots two real HTTP servers on distinct ports with distinct DBs and a shared MESH_PSK, and drives a message across. Acceptance: the e2e goes through the real chat write path, so a regression that removes the fanOutContent call or the boot-time upsertPeer makes it fail; it asserts the message is readable on the receiving instance after the request completes; it runs in CI without external network access.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
