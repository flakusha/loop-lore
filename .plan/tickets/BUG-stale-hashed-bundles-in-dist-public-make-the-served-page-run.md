<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: stale hashed bundles in dist/public make the served page run old JS

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-e2e-integration-testing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

`bun build --outdir dist/public` never removes the PREVIOUS content-hashed outputs, so a worktree that has been built more than once holds several `alpine-init-<hash>.js` files. Two lookups then pick ONE of them arbitrarily:

- `src/server/static-files.ts` `resolveHashedVariant` returns the FIRST `readdirSync` match for a bare name (`/alpine-init.js` maps to `alpine-init-<hash>.js`).
- `src/content/hash-injection.ts` `buildHashLookup` lets the LAST match win for the same logical name.

The browser E2E suite serves the published tree built from that same `dist/public`, so after any frontend source change the page can load a STALE bundle: the browser runs yesterday's JS while the test asserts today's behaviour. Observed in `tree/harness-approval-fixes`: the current sources build to `alpine-init-hdmn5bwr.js` (contains the new `harnessDecisionError` field) while the served page loaded `alpine-init-xm6xfv3q.js` (the pre-fix bundle) and the spec failed with `harnessDecisionError is not defined`; the reverse case silently passes a test against old code.

**Context:**

## Why it matters

The e2e browser gate is BLOCKING, and a stale bundle makes it test the wrong code: a green run can prove nothing, and a red run can blame the change for a build artefact. It only bites a dirty `dist/` (a fresh clone has one bundle per entry), which is every developer machine and every worktree that survives a frontend change.

## Where the fix belongs

The build output is the shared root cause: either the build prunes the previous hashed files, or both lookups resolve a bare name to the CURRENT build deterministically (newest by mtime, or a build manifest). A fix in one lookup leaves the other inconsistent.

**Acceptance Criteria:**

- [ ] The served bundle for a bare name is the CURRENT build's bundle, deterministically (no dependence on `readdirSync` order).
- [ ] The hash injection in the built HTML points at the current bundle.
- [ ] A regression test that builds twice with a changed source and asserts the served/reference bundle is the new one.
- [ ] Decision recorded for the old hashed files: delete them at build time, or keep them and pick the newest by mtime.
