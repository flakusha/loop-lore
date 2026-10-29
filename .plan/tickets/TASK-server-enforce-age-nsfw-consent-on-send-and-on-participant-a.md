<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: server: enforce age-NSFW-consent on send and on participant-add

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-nsfw-moderation-priority
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-3 server slice (T7): enforce age/NSFW-consent on send and on participant-add. Co-bind: epic-nsfw-integration-gaps.

**Ground state:** Chat-create-only gating: `src/routes/chats/create.ts` is the only `getStatus` (`src/age-gate/service.ts`) call site. Scout-verified: `src/routes/messages/create.ts` runs access → mute → VN → NSFW-flag → injection with **no age-gate/NSFW-consent check on send**, and `src/routes/chats/participants.ts` has **no age/NSFW/consent check on participant-add**. Shared verdict: `evaluateNsfwBase` in `src/middleware/nsfw-gate/base-eval.ts:51` (incl. age gate); server moderation depth `POST /api/chats/:id/moderate` (`src/routes/chats/moderation.ts:83-89`, `applyBan/applyKick/applyMute/applyFlag` via `src/chat/moderation.ts`, audit id returned); TUI create gating `src/tui/chat-create-api.ts:41-88` raw `fetch` preserving 403 bodies (`safeFetch` discards them, `:32-35`).

**Adopt/adapt/defer:** ADOPT Tuwunel policy-verdict shape (https://matrix-construct.github.io/tuwunel/moderation.html, impl https://github.com/matrix-org/policyserv): explicit refusal fails send CLOSED (`400 M_FORBIDDEN`); transport failure fails OPEN (sent unsigned) + logged; verdicts appended to the audit trail. ADAPT Gate-Matrix-Bot join-gate (https://github.com/dzlandis/Gate-Matrix-Bot): fail-closed participant-add + per-send re-check (no captcha bot). DEFER Matrix MSC2675/3381 relation envelope (correct long-term shape for flags, out of scope).

**Acceptance criteria:**

- [ ] Message-create runs the shared `evaluateNsfwBase` verdict (explicit denial → 403 with distinct `nsfw_*`/`age_*` code; infra failure → allow + audit log, per Tuwunel shape).
- [ ] Participant-add to an NSFW chat runs the same verdict (fail-closed).
- [ ] Every verdict appends to the existing `log_entries` trail.
- [ ] Web + TUI both surface the returned code (no new strings per client).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
