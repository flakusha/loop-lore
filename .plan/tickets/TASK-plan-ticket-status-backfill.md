<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Bulk-triage rule for status-less ticket index entries

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** Medium
**Related:** .plan/backlog/open-untriaged.md (advisory orphans)

## Summary

Define and apply a bulk-triage rule so every ticket index entry carries a meaningful status, making index status trustworthy for planning.

## Context

The bulk of `.plan/tickets/index.json` entries have no status. Hand-triaging one by one does not scale and the field stays meaningless. What is needed is a rule, not a slog: which entries count as open, which as stale, and what status discipline applies going forward (set at author time, updated on close) so the field does not rot again. Relevant tooling: `scripts/sync-ticket-index.ts`, `scripts/lib/sync-ticket.ts`.

## Acceptance Criteria

- [ ] Bulk rule documented (open vs stale vs closed criteria)
- [ ] Rule applied; sampled entries spot-checked by hand
- [ ] Going-forward discipline recorded (author/close updates status)
- [ ] `bun run plan:sync` green
