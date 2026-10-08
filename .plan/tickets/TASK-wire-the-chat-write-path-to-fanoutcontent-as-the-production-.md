<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Wire the chat write path to fanOutContent as the production sender trigger

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

fanOutContent (src/federation/fan-out.ts:143) has zero non-test callers. Nothing seals content, nothing requests a reservation, and mesh_outbox is never written in production - so the federation.outbox-drain cron -> runMeshOutboxPass (src/federation/outbox.ts:127-215) drains a table nobody writes. After a chat message persists, run authorizeChatExport -> fanOutContent for that chat. Must be gated on config.federation.enabled, must not block or fail the message write on a peer error, and must not weaken the default-deny gate to make it work - if consent is absent, nothing is sent. Acceptance: persisting a message in a consented chat produces exactly one reservation and one push; a failed push writes a mesh_outbox row that the drain cron re-pushes; an unconsented chat sends nothing and the original message write still succeeds.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
