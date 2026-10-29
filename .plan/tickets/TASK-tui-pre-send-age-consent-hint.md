<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI pre-send age-consent hint

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-frontend-age-gate
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-3 TUI slice (T9): pre-send age/consent hint. Server stays authoritative per the T7 companion ticket.

**Ground state:** TUI gates only at create: `src/tui/chat-create-api.ts:41-88` raw `fetch` preserving 403 bodies + `setCreateChat` seam at `src/tui/chat-picker.ts:91-93`; server depth (`src/middleware/nsfw-gate/`, `src/age-gate/service.ts` `getStatus`, `src/nsfw/moderation-service/` queue/audit) has no TUI send-time surface.

**Adopt/adapt/defer:** No external URL for this slice; the hint mirrors the web gate consent line (no duplicate enforcement client-side).

**Acceptance criteria:**

- [ ] TUI caches `GET /api/v1/age-gate/status` per session.
- [ ] Entering an NSFW-flagged chat without consent shows the same consent line the web gate shows before first send.
- [ ] No duplicate enforcement logic client-side (server remains authoritative per T7).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
