<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: nsfw-cards ships ungated POST routes

**Status:** Not Started
**Priority:** high
**Epic:** epic-security-sandboxing
**Effort:** Medium

**Summary:**

**Problem.** The `nsfw-cards` community plugin registers two stateful POST routes with no `requiresAuth`, no `permissions`, and no internal NSFW capability check — unlike the sibling surfaces that declare their gate. Now that route-level access control is load-bearing (`src/plugins/loader.ts:241`), this is the first real consumer whose declaration is missing, and its handlers perform no check of their own.

**Evidence.**
- `plugins/community/nsfw-cards/plugin.ts:24-29` — registers `POST /api/nsfw-cards/start` with `method`, `path`, `handler`, `description` only.
- `plugins/community/nsfw-cards/plugin.ts:31-36` — registers `POST /api/nsfw-cards/play`, same shape.
- `grep -n 'requiresAuth|permissions' plugins/community/nsfw-cards/plugin.ts` — no matches.
- `plugins/community/nsfw-cards/routes.ts:16-57` (`handleStart`) and `:64-106` (`handlePlay`) validate only `difficulty`, `handSize`, `cardIndex`, and `state` shape — no identity, no role, no NSFW capability, no consent check.
- `src/plugins/types.ts:178-180` — `requiresAuth` and `permissions` are the declared gate and are enforced pre-handler, so leaving them unset is not a neutral default; it is the most permissive one.

**Impact.** Both POST routes are reachable by any caller the app authenticates (or by anyone, under the default `auth.required = false` deployment) with no NSFW consent or capability gate, while the routes take and mutate encounter state. This is the reference counter-example for the declaration pattern.

**Fix direction.** Declare the gate the route actually needs on both registrations (`requiresAuth` plus the permission string for NSFW capability, matched against the existing `hasAll` matrix at `src/users/permissions.ts`), and add the internal check in the handlers so the route is safe even if a future dispatch path skips the registry gate. Note the solo-mode caveat at `src/plugins/types.ts:161-166`: under `auth.required = false` the declaration alone restricts nothing, so the internal check is what actually enforces here.

**Verification.** With NSFW capability not granted, both POSTs return the forbidden response and the loader boot warning no longer names either route.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
