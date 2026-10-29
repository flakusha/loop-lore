<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: unify NSFW gate domain service (strangler over scattered callers)

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-code-quality
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD recommendation 3 (High impact, Low risk, 2-4 weeks). Single NsfwAccessService in src/nsfw/ composing base-eval, consent ledger, capability gate; replace scattered calls in generation hooks and routes. Strangler: keep middleware barrel re-exports. Scattered today: isNsfwRating (middleware/nsfw-gate constants + index), checkNsfwEligibility/checkNsfwWithConsent + runContentHooks (generation/auto-gen/content-hooks.ts), nsfw-hook.ts (generation/hooks), assertNsfwCapability (nsfw/capability-gate.ts), location nsfw (rpg/location-nsfw/service.ts), routes (src/routes/nsfw/*). Recurring contradiction risk (BUG-two-gates-age-gate-keys referenced in base-eval.ts).

Owner: epic-code-quality (DDDReview correction 2026-10-29: epic-architecture is a vision/status doc, not a refactor owner). Co-bind: epic-nsfw-moderation-priority + epic-nsfw-integration-gaps (verified present). Verified: duplicated evaluation paths with divergent severity scoring; age-gate shared via base-eval but multiple callers.

Acceptance: one NsfwAccessService composes eval + ledger + capability; all generation hooks and routes call it (barrel re-exports keep old imports working); contradiction test (two-gates scenario) green; bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
