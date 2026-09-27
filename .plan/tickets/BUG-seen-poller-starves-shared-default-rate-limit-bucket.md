<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Seen-poller starves shared default rate-limit bucket

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:** seen poller starves shared default rate limit bucket
**Context:** Context: BUG-rate-limit-policies-starve half-fixed; chatPolicy comment (policies.ts:31) claims seen-poller coverage but routePolicies (policies.ts:51-55) only matches /auth /generation /chats.
**Acceptance Criteria:** add ['/api/v1/messages', chatPolicy] to routePolicies and add a replay-budget test from the real poll pattern.

## Summary

Context: BUG-rate-limit-policies-starve half-fixed; chatPolicy comment (policies.ts:31) claims seen-poller coverage but routePolicies (policies.ts:51-55) only matches /auth /generation /chats. Severity: blocking. The seen-poller (chat-seen.ts:15,96-100) N-GETs /api/v1/messages/:id/seen every 5s — resolves to defaultPolicy 300/min shared with all unmatched routes; a >=26-message chat sustains >300 req/min per user → 429 storm + shared-bucket starvation. Repro: 26+ messages, open chat, watch 429s. Fix: add ['/api/v1/messages', chatPolicy] to routePolicies and add a replay-budget test from the real poll pattern.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
