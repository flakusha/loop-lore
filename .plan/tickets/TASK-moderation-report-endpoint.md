<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: moderation report endpoint

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

[gap-audit E12] No user-facing content-report endpoint exists. Verified:
`grep moderation/report|moderation-report` across `src/routes` returns zero
matches. The flag pipeline (`src/routes/nsfw-moderation/flags.ts` —
POST/GET/PUT `/api/nsfw/moderation/flags`) covers NSFW moderation flags
only, while general moderation actions (mute/kick/flag) live in the chat
domain service `src/chat/moderation.ts` (applyMute/applyKick/applyFlag;
test anchors `src/chat/moderation.test.ts:416` mute with reason+duration,
:453 applyFlag) behind the moderator-gated `POST /api/chats/:id/moderate`
(`src/routes/chats/moderation.ts:5`). A regular user has no HTTP surface
to report general (non-NSFW) content.

## Scope

- `POST /api/v1/moderation/report` — authenticated via `requireUserId`
  (`src/routes/http-utils.ts`), creating flag-queue rows for general
  (non-NSFW) reports.
- Reuse the chat moderation domain service (`src/chat/moderation.ts`) for
  the queue-row plumbing and audit trail; do not fork a second flag model.
- Optional configurable auto-mod rules (mute thresholds derived from
  report volume) are a follow-up slice — explicitly out of scope here.

## Coordination

Shares surface with the false-report-protection ticket (open registry issue
e2d659b, no .plan reflection yet): abuse signals
on reports (report spam, rate shaping, reporter reputation) belong THERE,
not here. This ticket is the endpoint + queue-row plumbing only. It is
also the HTTP slice of the external-flagging pathway tracked by
TASK-internal-external-flagging.

**Acceptance Criteria:**

- [ ] POST /api/v1/moderation/report exists and rejects anonymous callers (401 via requireUserId)
- [ ] Valid reports create general (non-NSFW) flag-queue rows through the chat moderation domain service
- [ ] Route-level tests mirroring the nsfw flags route test style (`src/routes/nsfw-moderation/flags.routes.test.ts`: auth, session-derived reporter identity, validation, queue-row effect)
- [ ] Docs touched for the new endpoint

## Files

- `src/routes/` — new report route module registered in the router (follow the `src/routes/nsfw-moderation/flags.ts` pattern)
- `src/chat/moderation.ts` — reused; extend only as needed
- new route-level test file mirroring `src/routes/nsfw-moderation/flags.routes.test.ts`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
