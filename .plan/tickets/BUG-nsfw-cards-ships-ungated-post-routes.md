<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: nsfw-cards ships ungated POST routes

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — both POST registrations (plugins/community/nsfw-cards/plugin.ts:24-46) now declare `requiresAuth: true` + `permissions: ["nsfw.play"]`, and both handlers (plugins/community/nsfw-cards/routes.ts — nsfwDenial guard at the top of handleStart/handlePlay) enforce the same check internally so a dispatch path that skips the registry gate cannot unguard them. DECISION (recorded per fix direction): `nsfw.play` is a NEW capability granted to NO default role — only "*" holders (admin/solo/tester) pass — so the routes are default-deny for user/creator/moderator/etc. until an operator grants `nsfw.play` via permission overrides; no existing vocabulary entry fit (admin.audit.nsfw is an audit-scoped admin permission, not a content capability). Repros in plugins/community/nsfw-cards/routes.test.ts (5 tests): declaration test + anonymous→401 + user-role→403 + admin→handler + direct-handler-without-caller→403. Before-evidence (captured): declaration test `Expected true, Received undefined`, anonymous `Expected 401, Received 200`, user `Expected 403, Received 200`, direct `Expected 403, Received 200`; 1 pass / 4 fail pre-fix, 5/5 post-fix. Gates: typecheck + eslint green (run 687742-mvng4hwx), worktree fix/bug-sweep, issue BUG-NSFW-CARDS-SHIPS-UNGATED-POST-ROUTES.
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

Closure rationale (2026-10-25, branch `fix/bug-sweep`): both POST registrations (plugins/community/nsfw-cards/plugin.ts:24-46) now declare `requiresAuth: true` + `permissions: ["nsfw.play"]`, and both handlers (plugins/community/nsfw-cards/routes.ts — nsfwDenial guard at the top of handleStart/handlePlay) enforce the same check internally so a dispatch path that skips the registry gate cannot unguard them.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue ac70870 (registry tip: c7674cab4 Konstantin Fedotov Close issue)
