<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bridge daemon adoption: Matterbridge/slidge/mautrix/biboumi evaluation

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-federation-swarm-sync

**Summary:**

Adopted component: matterbridge (Apache-2.0) primary; mautrix (AGPL-3.0), slidge (GPL-3.0), biboumi (GPL-3.0) alternatives — all external daemons with REST/XMPP interfaces. Seam: src/integrations/bridge-daemon.ts (new) — a ProtocolAdapter that proxies to a local daemon's HTTP API instead of embedding a protocol. Decides when a daemon is preferable to a native adapter (many networks at once, AGPL isolation via process boundary). AC: decision table in docs/research/federation-messenger-email-integration-research.md §3.10; one daemon proxied end-to-end against a fixture daemon; AGPL components process-isolated (never linked); docs/spec/federation-messenger-channels.md §9 updated. Epic: epic-federation-swarm-sync.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
