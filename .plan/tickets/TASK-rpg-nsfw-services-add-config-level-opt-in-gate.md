<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: rpg NSFW services: add config-level opt-in gate

**Status:** Done
**Priority:** high
**Effort:** Small

**Summary:** Five of the ten NSFW RPG service modules do not currently route through assertNsfwCapability. Setting `nsfw.allowNsfw=false` only blocks the HTTP middleware path; the RPG NSFW service methods (seduction, encounter, fantasy, body, reproduction, mood, chemistry, reputation) still execute mutations. Add a single throw-on-disabled helper and call it at the top of each NSFW RPG service public method.

**Context:** Audit of the NSFW opt-in surface (this ticket) while landing TASK-src-rpg-module-root-barrel-and-organization-nits. The audit found:
- The HTTP middleware path (`src/middleware/nsfw-gate/base-eval.ts:48`) correctly short-circuits on `!config.nsfw.allowNsfw` (returns `{ allowed: false, reason: "nsfw_disabled" }`)
- The RPG capability gate (`src/nsfw/capability-gate.ts`) checks rating + consent + intimacy but assumes NSFW is allowed (no early-out on `!allowNsfw`)
- Only `src/rpg/intimacy/service/actions.ts:54` calls `assertNsfwCapability` - the other 9 NSFW RPG services do NOT
- The 9 ungated services: `seduction`, `encounters`, `fantasies`, `body-systems`, `reproduction`, `mood`, `chemistry`, `reputation`, `skills`

The user-facing claim "NSFW can be disabled at the config level" is currently FALSE for the RPG layer. This ticket fixes that.

**Acceptance Criteria:**

- [ ] New helper `assertNsfwEnabled(config)` in `src/nsfw/feature-flag.ts` (or similar) that throws `NsfwDisabledError` when `config.nsfw.allowNsfw === false`
- [ ] Each of the 9 ungated NSFW RPG service public methods calls `assertNsfwEnabled(config)` at the top of its first mutation step
- [ ] Unit test: `assertNsfwEnabled` throws on `allowNsfw=false`, returns on `allowNsfw=true`
- [ ] Unit test for each touched service: setting `allowNsfw=false` causes the service method to throw
- [ ] Coverage of the new helper >= 100%
- [ ] Typecheck passes
- [ ] Documentation: a short section in `docs/spec/nsfw-gates.md` (or existing equivalent) explains "to disable NSFW at config level, set `nsfw.allowNsfw=false`; this short-circuits the HTTP middleware + all 10 RPG NSFW service methods"
- [ ] `giwt plan validate` exit 0

**Notes:**

The fix is small (one helper + one call per service, ~10 lines of code + tests). Each service already takes a `config` argument (or has one in scope); the guard is one line at the top of the public method.

Order of implementation:
1. Write the helper + test (TDD: write the test first, see it fail, add the helper)
2. Add the call to `src/rpg/seduction/service/*.ts` (4 public methods) - matches TASK-034 scope
3. Add the call to `src/rpg/encounters/service/*.ts` (3 public methods) - matches TASK-036
4. Add the call to `src/rpg/fantasies/service/*.ts` (3 public methods) - matches TASK-037
5. Add the call to `src/rpg/body-systems/service/*.ts` (3 public methods) - matches TASK-035
6. Add the call to `src/rpg/reproduction/*.ts` (move target after NIT 3, then 2 methods) - matches TASK-038
7. Add the call to `src/rpg/mood.ts` re-export path or the canonical MoodService methods - matches TASK-041
8. Add the call to `src/rpg/chemistry.ts` re-export or canonical ChemistryService methods - matches TASK-039
9. Add the call to `src/rpg/reputation.ts` re-export or canonical ReputationService methods - matches TASK-042
10. Documentation update

Note: TASK-040 (NSFW Skills) is exempt - the resolution block explicitly states "NSFW skill XP flows through the same shared SkillsService" and the shared skills service is not gated (it serves non-NSFW purposes too). Skip nsfw-skills.

The helper could live in `src/nsfw/feature-flag.ts` next to `capability-gate.ts`. Or colocated with `assertNsfwCapability`. Decision: same file as `capability-gate.ts` since it's the same conceptual boundary.

**Related Files:**

- src/nsfw/capability-gate.ts (add helper here)
- src/nsfw/capability-gate.test.ts (extend tests)
- src/rpg/seduction/service/*.ts (add call)
- src/rpg/encounters/service/*.ts (add call)
- src/rpg/fantasies/service/*.ts (add call)
- src/rpg/body-systems/service/*.ts (add call)
- src/rpg/reproduction/*.ts (add call)
- src/rpg/mood.ts (add call or re-export)
- src/rpg/chemistry.ts (add call or re-export)
- src/rpg/reputation.ts (add call or re-export)
- docs/spec/nsfw-gates.md (or equivalent - new or extended)
- .plan/tickets/TASK-src-rpg-module-root-barrel-and-organization-nits.md (parent survey)
