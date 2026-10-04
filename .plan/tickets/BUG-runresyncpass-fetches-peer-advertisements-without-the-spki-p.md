<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: runResyncPass fetches peer advertisements without the SPKI pin gate

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** security, federation

**Summary:**

The resync pass (src/federation/coordinator.ts:169-185) defaults to fetchPeerAdvertisement and threads trust typed { caBundle } only; no pin verification runs, unlike the gossip poll path (pinOk in src/federation/gossip.ts). It also indexes trustByOrigin by raw peer.origin, skipping the origin canonicalization 7dfec7e6e added to GossipService, so non-canonical config keys lose their caBundle here too. A peer with configured spkiPins is pin-verified on gossip but this pass ingests the same advertisement from anyone presenting a CA-valid cert. Follow-up to TASK-spki-pin-verification-for-federation-peers (Done). Fix: thread spkiPins through the trust type, run the same pinOk check, and share the canonicalization helper so the paths cannot drift.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
