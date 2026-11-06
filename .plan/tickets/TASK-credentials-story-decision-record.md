<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: credentials-story-decision-record

**Status:** Not Started
**Blocker:** HELD — ticket-file collision with dev: dev filed this ticket as `d7fd5c36a` (Not Started skeleton) while the branch re-filed it with the Done + Decision-record content (`85a5a3db9` ADR slice + `eedd65bb1` issuer-model ADR). Owner at landing: merge the ticket file toward the branch content (Done + ADR pointer), do NOT keep the dev skeleton. Next: land `credentials-decision-record`, then flip this ticket to Done with the landing sha.
**Priority:** high
**Effort:** Medium
**Epic:** epic-principal-scoped-credentials

**Summary:**

Resolve epic-principal-scoped-credentials §5 Q4 (admin-issued scoped tokens vs OAuth-style) into an ADR covering both sibling scenarios at once. Key research findings (from the 2026-11-05 credential research pass): BYOK needs agent-key→subject binding; federation needs instance-issued work tokens and a peer principal; the design constraints are one issuer, one credential table, tier vocabulary = FacadeScope ("read" | "chat-write" today, extendable), and a fail-closed verification seam that is a sibling of `authenticate` + `requireAuthGuard`. Both sibling epics (`epic-agentic-integration-mcp-acp`, `epic-harness-rsi-repo-access`) declare this as their single dependency, so the decision unblocks all seven implementation tickets. Existing posture to respect: `src/integrations/harness/isolation-gate.ts:8-24` binds allowed execution to exactly one userId and never shares subscriptions; `src/middleware/types.ts:13` declares PrincipalKind with `user-worktree`/`external-agent` produced nowhere; the facade scope tier seam lives at [branch epic-agentic-integration] `src/integrations/loop-lore-facade/authz.ts:20-23` ("scope becomes an enforced key-tier check once the scoped-credential epic lands (Q4); until then every admitted principal holds both tiers").

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [ ] ADR records the Q4 decision (token shape, issuer model, tier vocabulary) with rationale for both BYOK and federation scenarios
- [ ] One issuer, one credential table, FacadeScope tier vocabulary documented
- [ ] Verification seam design fail-closed and a sibling of `authenticate`/`requireAuthGuard`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
