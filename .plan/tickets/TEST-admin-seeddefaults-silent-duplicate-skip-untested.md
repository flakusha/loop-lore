<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: admin seedDefaults idempotency and silent-dup handling untested

**Status:** Open
**Priority:** low
**Priority Tier:** P5
**Effort:** Small
**Area:** admin
**Source:** reconcile review (Scout Batch B — ISSUE-005)

## Evidence

`src/admin/config.ts` — `seedDefaults` catches duplicate-key errors with `log().warn` and continues silently. `config.test.ts` covers CRUD but NOT `seedDefaults`.

## Impact

If `seedDefaults` is called twice, or a default key is duplicated in the defaults array, it silently fails to seed some values — no CI signal.

## Fix

Add `config.test.ts`:

```ts
it("seedDefaults is idempotent (no throw on second call)", async () => {
  await seedDefaults(db);
  await expect(seedDefaults(db)).resolves.not.toThrow();
});

it("all 11 default keys present after seedDefaults", async () => {
  await seedDefaults(db);
  const rows = await db.selectFrom("system_config").execute();
  const keys = rows.map(r => r.key);
  expect(defaults.every(d => keys.includes(d.key))).toBe(true);
});
```

## Verification

- Run `bun test src/admin/config.test.ts`

## Acceptance Criteria

- [ ] Idempotency test passes
- [ ] All default keys present after double-seed
