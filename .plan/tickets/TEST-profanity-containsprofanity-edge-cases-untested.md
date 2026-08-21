<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: profanity containsProfanity edge cases untested

**Status:** Open
**Priority:** low
**Priority Tier:** P5
**Effort:** Small
**Area:** moderation (profanity)
**Source:** reconcile review (Scout Batch B — ISSUE-004)

## Evidence

`src/profanity/service.ts` — `containsProfanity()` has no explicit tests. `service.test.ts` covers only `filter()` replace behavior.

Missing: empty string, pure profanity string, mixed case ("FuCk"), unicode confusables, string with no profanity.

## Fix

Add to `service.test.ts`:

```ts
describe("containsProfanity", () => {
  it("returns false for empty string", () => { ... });
  it("returns true for pure profanity", () => { ... });
  it("is case-insensitive", () => { ... });
  it("returns false for clean text", () => { ... });
});
```

## Verification

- Run `bun test src/profanity/service.test.ts`

## Acceptance Criteria

- [ ] All edge cases covered
- [ ] No regression in existing `filter` tests
