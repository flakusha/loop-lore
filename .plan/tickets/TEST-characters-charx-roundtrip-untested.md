<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: characters charx round-trip extract→create untested

**Status:** Open
**Priority:** low
**Effort:** Small
**Area:** characters
**Source:** reconcile review (Scout Batch C — CHAR-2)

## Evidence

`src/characters/charx.ts` — `extractCharx` and `createCharx` are defined and called from export routes. No direct test for `extractCharx(createCharx(data))` round-trip.

## Impact

If the .charx format changes, no test will catch regression.

## Fix

Add `src/characters/charx.test.ts`:

```ts
it("round-trips: extractCharx(createCharx(data)) → data", () => {
  const original = { name: "Eldon", description: "A wizard", traits: ["wise"] };
  const charx = createCharx(original);
  const extracted = extractCharx(charx);
  expect(extracted).toMatchObject(original);
});
```

## Verification

- Run `bun test src/characters/charx.test.ts`

## Acceptance Criteria

- [ ] Round-trip test passes
- [ ] Field loss detected by test
