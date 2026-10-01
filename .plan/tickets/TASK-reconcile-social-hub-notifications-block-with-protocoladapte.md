<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Reconcile social-hub notifications block with ProtocolAdapter

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-social-hub.md

**Summary:**

epic-social-hub.md Phase 4 notifications/ block (notifications.ts, rules.ts, channels.ts) duplicates capability flags already declared on ProtocolAdapter (src/integrations/adapter.ts) and NotificationService fan-out (src/notifications/service/service.ts). Retire the parallel subsystem: Social Hub adapters (Discord/Telegram) implement ProtocolAdapter directly; factor-change alerts (auth F7) fan out via NotificationService to ProtocolAdapter-backed channels. Discord/Slack/IRC reach goes via Matrix appservice bridges (epic-matrix-integration.md scope) — no native adapters. AC: no duplicate capability declarations; social-hub epic references ProtocolAdapter as its adapter surface. Epic: epic-social-hub.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
