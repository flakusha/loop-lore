<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Extension supply-chain policy (official-list, spend caps, server-plugins-off)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-security-sandboxing
**Tags:** supply-chain, plugins, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Bot Browser incident lesson (research 01 safety note, May-2026: extension stole API keys). Adopt as policy for our plugins/ + harness pair: official-list preference, per-profile spend caps, server plugins off by default, prune-unused guidance. ST extension-framework parity is shape-only (modular APIs); this ticket is the policy layer. Research: .tmp/research/ai-cheat/01-outside-takes.md gap 7, 05-docs-mapping.md framework section.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
