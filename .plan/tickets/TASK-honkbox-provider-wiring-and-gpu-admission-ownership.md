<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox provider wiring and GPU admission ownership

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-platform-integrations

**Summary:**

**Summary:** Wire loop-lore to honkbox as an OpenAI-compatible Custom provider and prove one chat turn plus one image job end to end, with single-side GPU admission. Mirrors the honkbox-side provider-smoke ticket (Status: proposed).

**Acceptance:** Custom provider pointed at /v1/chat/completions completes one chat turn; one /v1/images/generations job completes with observable /v1/jobs and /v1/events state; mid-run cancel works; exactly one side owns GPU admission (loop-lore scheduler vs honkbox ledger, never both); per-run temp data dirs for both apps; no MCP surface added to honkbox.

**Caveats:** TOCTOU on provider health vs dispatch; bearer auth handling; partial failure (image job orphaned on cancel); stale state (model unloaded mid-run); observability (queue/lease metrics both sides); rollback (provider entry removable without restart).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
