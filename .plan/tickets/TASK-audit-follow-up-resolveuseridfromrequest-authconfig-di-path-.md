<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: resolveUserIdFromRequest authConfig DI path untested

**Status:** ✅ Resolved (commit `00d5e0f2`)
**Priority:** low
**Effort:** Medium

## Summary

Audit found c9ca8edd added optional 4th authConfig param to resolveUserIdFromRequest for DI of pre-loaded AuthConfig. Both call sites in src/routes/export.ts and src/routes/export-sse/start.ts still pass only 3 args, so the optimized DI path is never exercised in production and has zero test coverage. Either wire DI or drop the unused param. See audit .audit-batch-A-message-seen-gen.md finding MEDIUM.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in commit `00d5e0f2` (`feat(auth): wire DI authConfig in export routes; tests for triggerAutoGeneration catch path + DI override`).

Both call sites now pass the 4th `authConfig` arg:

```diff
- const userId = await resolveUserIdFromRequest(ctx.request, database, "solo",);
+ const { auth: authConfig, } = loadConfig();
+ const userId = await resolveUserIdFromRequest(ctx.request, database, "solo", authConfig,);
```

- `src/routes/export.ts` (POST `/api/export`) — calls `loadConfig()` to obtain `authConfig`, then passes it as the 4th arg.
- `src/routes/export-sse/start.ts` (POST `/api/export/progress`) — same wiring.

The DI contract is also covered by a regression test in `src/middleware/auth.test.ts`:

```ts
it("uses the authConfig 4th-arg over env when DI is provided (BUG-resolveuseridfromrequest-authconfig-di)", async () => {
  // …seeds a sessions row keyed by sha256(token) and confirms:
  //  – env fallback ON + no DI = resolves via sha256 (legacy path active)
  //  – DI with legacyOpaqueTokenFallback=false suppresses the env-driven fallback
  expect(await resolveUserIdFromRequest(req, db, "demo",)).toBe(userId,);
  expect(
    await resolveUserIdFromRequest(req, db, "demo", LEGACY_OFF_DI_CONFIG,),
  ).toBe(solo?.id ?? null,);
});
```

DI is now wired in production AND pinned by a test, so a future refactor cannot silently regress to "callers pass 3 args and the 4th arg is dead code again".

Verification (scoped, no project-wide check):

```
$ bun test src/middleware/auth.test.ts src/generation/auto-gen/auto-generation.test.ts
 20 pass
 0 fail
```

## Related

- `TASK-audit-follow-up-triggerautogeneration-catch-path-untested` — sibling ticket in the same batch
- git issue `0735878`