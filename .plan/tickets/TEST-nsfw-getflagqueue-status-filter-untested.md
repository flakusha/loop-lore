<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: nsfw getFlagQueue status filter has zero test coverage

**Status:** Open
**Priority:** medium
**Priority Tier:** P5
**Effort:** Small
**Area:** moderation
**Source:** reconcile review (Scout Batch B — ISSUE-003)

## Evidence

`src/nsfw/moderation-service/flags.ts` — `getFlagQueue(status)` with `status` parameter (active/dismissed/resolved) has no test. `flags.test.ts` covers only `flagContent` (create) and duplicate-throw.

## Impact

Regression risk: status-filtering logic is untested; wrong filter produces wrong queue silently.

## Fix

Add to `flags.test.ts`:

```ts
it("returns only active flags when status='active'", async () => {
  await db.insertInto("content_flags").values([...active, ...resolved]);
  const queue = await getFlagQueue(db, "active");
  expect(queue).toHaveLength(active.length);
  expect(queue.every(f => f.status === "active")).toBe(true);
});
```

## Verification

- Run `bun test src/nsfw/moderation-service/flags.test.ts`

## Acceptance Criteria

- [ ] All three status variants tested (active/dismissed/resolved)
- [ ] Mixed dataset confirms correct filtering
