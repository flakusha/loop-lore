<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: browser mesh data-plane spike (y-webrtc room per consented chat, time-boxed)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

B2 data-plane spike, time-boxed. y-webrtc room per chat behind coordinator-issued clearance capability, signaling URL from coordinator DB, server snapshot as join truth. Room join requires coordinator-issued capability checked server-side per join + per message; re-verify authorizeChatExport-equivalent at use (not once at join); invalid/expired/revoked refused; chat id not equal auth (membership + consent row checked); signaling URL from knowledge DB only for trusted peers; no implicit trust between browsers (per-call auth, no skipped internal path). DEFER libp2p unless spike proves relay need. Feeds gossip-contract ticket (coordinator stays source of truth; provider carries no auth/persistence).

Owner: epic-mesh-federation-content-sharing.md (Done + reopened). Verified: coordinator role-not-app; peer-registry; gossip over PeerTable (transport/peer-table.ts); cron federation.gossip 1min + resync hourly; negotiation idle-to-established; clearance authorizeChatExport default-deny :64-107; dek-rewrap clearance-bound; delivery LWW + reservation confirm; fan-out double gate; mesh_outbox 046 + dead-letter; performance-quota per-cell + accessor; mesh-proof HMAC-PSK. Zero y-webrtc/yjs/libp2p/WebRTC/gossipsub/trystero/peerjs/TURN/STUN in src/ (negative; gossip is HTTP polling /api/instance-state).

Refs: y-webrtc https://github.com/yjs/y-webrtc + awareness https://docs.yjs.dev/getting-started/adding-awareness (adapt room-per-chat + awareness; defer persistence/auth to server); js-libp2p browser transport (defer: heavyweight, overlaps shipped gossip, revisit only for relayed NAT).

Acceptance: 2 browsers sync presence + ephemerals in consented chat; revoke then rejoin refused; doc note that coordinator stays source of truth; per-test chat + peer origins (uid), isolated clearance rows, gossip/cron not shared, teardown revokes grants.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
