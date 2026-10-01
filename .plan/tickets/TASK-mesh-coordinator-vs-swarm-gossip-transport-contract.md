<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Mesh coordinator vs swarm gossip transport contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing.md

**Summary:**

epic-federation-swarm-sync.md Phase D assumes y-webrtc/libp2p gossip peer discovery while epic-mesh-federation-content-sharing.md Phase 1 owns a coordinator control plane for the same discovery; TASK-mesh-peer-discovery-gossip is Done but no shared contract exists. Decide: coordinator drives peer discovery/liveness OR gossip transport does; document the interface (peer liveness protocol owner, resync trigger path) in both epics. Also link TASK-federation-dek-re-wrap-protocol to epic-mesh-federation-content-sharing.md Phase 2 and add FEAT-federate-blog-system-via-activitypub to epic-federation-swarm-sync.md Linked Tasks. AC: contract section in both epics; the two link fixes applied. Epic: epic-mesh-federation-content-sharing.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
