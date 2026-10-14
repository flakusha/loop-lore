<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Residual review nits: nsfw ignoreModeration escape hatch, character-emotions 404-vs-403, templates readFileSync, auth.required default

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Four low-severity findings from the 2026-10-14 review round that do not warrant a BUG of their own.

1. ignoreModeration has no production caller. src/middleware/nsfw-gate/base-eval.ts:47 accepts opts.ignoreModeration, which skips the banned/blocked denial. The only thing that sets it is resolveRequestContext's skip.moderation (src/middleware/nsfw-gate/request-context.ts:116-117), and the only caller that passes skip.moderation: true is request-context.test.ts:177. It is a public escape hatch on the NSFW gate with zero production users.

2. character-emotions collapses ownership mismatch into 404. All four handlers in src/routes/character-emotions/actor.ts (:55, :89, :131, :200) call checkActorOwnership and return HttpStatus.NotFound when it returns false. The repo's canonical helper resolveActorAccess (src/routes/actor-access.ts:42-55) returns 404 for a missing row (:52) and 403 for an ownership mismatch (:53). The two shapes disagree. Note the counter-argument before changing anything: checkActorOwnership returns false for BOTH a missing row and a non-owned row (src/routes/actor-auth.ts:96 returns false when the actor is absent, :97 for the ownership test), so 404-for-both may be deliberate enumeration hardening. It is still an undocumented divergence from the canonical helper, and the honest resolution is to record which behavior is intended rather than to silently normalise one side to the other.

3. loadConfigChatSetupTemplates reads the file outside the try. src/chat/service/templates.ts:51 readFileSync(chosen.path, 'utf8') is outside the try that wraps the TOML/YAML parse at :53-57, so an unreadable template file throws instead of returning [] like every other failure in the function.

4. auth.required defaults to false. src/config/sections/auth.ts:7. Deliberate and documented (docs/spec/users-sessions.md:95, docs/spec/auth-middleware.md:10), so this is not a code defect — it is recorded here so the default is an owned decision rather than an accident. docs/research/00-index-and-decisions.md:154 already calls the solo-mode posture an undecided live risk.

Source: .tmp/longcat/review-consolidated.md nits 18, 19, 26, 34.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
