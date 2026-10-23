<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend banned-pattern ownership comment claims ESLint enforces what it does not

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** (none — hygiene/self-contained)
**Tags:** frontend, eslint, gates, documentation
**Summary:** Fix a stale ownership comment in `eslint.config.mjs` that misstates which component enforces frontend banned patterns.
**Context:** `eslint.config.mjs:322-324` states: "Banned-pattern enforcement on frontend is owned by ESLint (not a separate script). Warn-level so `check` stays green while surfacing debt; promote to 'error' after the existing occurrences are cleaned up."

That statement is false, and it contradicts two other files:

- `scripts/check-frontend-banned-patterns.ts:6-14` calls itself the "ESLint-gap complement" — the opposite ownership claim.
- `scripts/check/parallel/nonblocking.mjs:5-7` lists "frontend banned patterns" among the runner's OWN non-blocking checks.

The two rules printed immediately beneath the comment are `@typescript-eslint/no-explicit-any` (`eslint.config.mjs:325`) and `no-console` (`:326`). Neither is a banned-pattern rule. The frontend block (`:278-328`) contains no warn-level banned-pattern enforcement at all.

Actual behaviour: `nonblocking.mjs:69` spawns `bun run scripts/check-frontend-banned-patterns.ts` on every `bun run check` and every `giwt finalize`; `:80` maps its exit code to `ok`/`warn`; `:85-90` pushes findings into the check report's `nonBlocking` notes (capped at 4000 chars). It reports continuously and never gates, by design — `nonblocking.mjs:5-7` says so explicitly.

Three files make inconsistent ownership claims and none describes what actually happens. This is documentation rot, not a missing gate.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- Rewrite the comment at `eslint.config.mjs:322-324` so it states the truth: enforcement is owned by `scripts/check-frontend-banned-patterns.ts`, run through `scripts/check/parallel/nonblocking.mjs`, reporting into `nonBlocking` notes and never gating.

## Out of Scope

- Changing the rule set. The runner's non-blocking ownership is deliberate; rewriting the comment to match reality is the correct and cheaper fix.
- Promoting the advisory gate to blocking. That needs the debt cleared first — tracked separately.
- Changing `scripts/check-frontend-banned-patterns.ts` or `nonblocking.mjs` behaviour.

## Acceptance Criteria

- [ ] `eslint.config.mjs:322-324` no longer claims ESLint owns the enforcement, and no longer describes a warn-level setup that does not exist.
- [ ] The replacement comment names the actual owner (`scripts/check-frontend-banned-patterns.ts` via `scripts/check/parallel/nonblocking.mjs`) and states that it reports without gating.
- [ ] No rule in the frontend block (`:278-328`) was added, removed, or changed severity.
- [ ] `bun run lint:eslint` exits 0.

## Related Files

- `eslint.config.mjs:278-328` — the frontend override block
- `eslint.config.mjs:322-324` — the comment being fixed
- `scripts/check-frontend-banned-patterns.ts:6-18` — the real owner
- `scripts/check/parallel/nonblocking.mjs:5-7,67-93` — how it runs
