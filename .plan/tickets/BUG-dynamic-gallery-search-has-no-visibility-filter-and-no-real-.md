<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Dynamic gallery search has no visibility filter and no real auth

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

POST /dynamic/gallery/search (`src/routes/views/search.ts:18`) applied no visibility filtering and no real authentication; the dynamic plugin route plumbing did not enforce the standard `requireUserId`/visibility gates used by the authenticated gallery views — any caller could search across other users' (including hidden/private) assets. Fix: route the dynamic search through the same auth + visibility scoping as the authenticated gallery; add tests proving cross-user/hidden exclusion. **Both defects are now fixed — see Verification 2026-10-05.**

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Review 2026-10-04 (SUPERSEDED — both sub-claims now fixed)

PARTIAL at the time. serveGallerySearch already received viewer identity
(`src/routes/views/plugin-dynamic.ts:65-70`), applied tag owner-scope and G6
visibility inheritance via `inheritedHiddenAssetIds`. Still open then: no
`requireUserId`/auth gate (`ctx.userId` cast, may be null), and the query had
no base visibility WHERE — it selected all assets, unlike the grid's
public/owned/shared + public-character filter.

Both of those were fixed after this review; see Verification 2026-10-05.
This paragraph is kept only as the review history.


## Verification 2026-10-05

Both sub-claims re-checked independently.

**(i) Base visibility WHERE — fixed, in SQL not in JS.**
`src/routes/views/search.ts:38` calls the shared helper:

```ts
qb = applyGalleryAssetFilters(qb, { actorId, isAdmin, entityType, entityId, tag, },);
```

`applyGalleryAssetFilters` (`src/routes/views/gallery.ts:36-78`) narrows the
query builder itself — `out.where((eb,) => visibleGalleryAssetFilter(eb, actorId ?? "",))`
at line 47 — it does not filter rows after the fetch.
`visibleGalleryAssetFilter` (`src/assets/service/read.ts:120-133`) emits a
real `eb.or([...])` over `visibility = 'public'` OR `owner_id = actorId` OR
(`visibility = 'shared'` AND an `EXISTS` in `asset_shares` for this viewer)
OR an `EXISTS` for a link to a PUBLIC character. The gallery grid
(`gallery.ts:166`) calls the same helper, so the two views cannot drift.

Checked empirically rather than by reading alone: seeded one public, one
`shared` (not shared with the viewer, no character link), and one `private`
asset, then called `serveGallerySearch` directly. A non-owner and an
anonymous viewer both saw `public=true, shared-only=false, private=false`.
The owner saw all three. `shared`-only assets no longer leak — that was the
specific claim in the 2026-10-04 review.

**(ii) Auth gate — fixed.** `src/routes/views/plugin-dynamic.ts:65-66`:

```ts
const userId = requireUserId(ctx,);
if (typeof userId !== "string") { return userId; }
```

`ctx.userId` is no longer an unchecked cast. `requireUserId`
(`src/routes/http-utils/errors.ts:101-108`) returns a 401 `Response` when
the value is absent, and the handler returns it. Note the neighbouring
`/dynamic/gallery/grid` (line 42) still uses the old unchecked
`ctx.userId as string | null` cast — that endpoint is out of this ticket's
scope and is a separate follow-up, not a regression here.

**What an unauthenticated caller can observe today: nothing.** Two
independent reasons, either sufficient: the route 401s before the handler
runs, and even if it did not, the SQL filter at (i) narrows to public /
owned / shared-with-you / public-character-linked.

Probed every unauthenticated shape through the real Elysia route, not just
the one the test covers. `makeApp(db)` with no `derive` is only ONE of them,
so this was checked separately — all four return 401 and render no asset card:

- no `derive` at all (what `plugin-dynamic.test.ts` covers)
- `userId: undefined`
- `userId: ""` — the falsy edge `requireUserId` guards with `if (!userId)`
- `userId: null`, the realistic stale/forged-cookie shape: `authenticate.ts:151-158`
  falls through to the 401 at `:182-186` when auth is required and no valid
  token verifies, so `userId` never reaches these views in that case

**One qualified case, not a defect in this ticket.** A caller arriving with
`role: "solo"` DOES see another user's `private` asset. That is the
`admin.character` bypass: `DEFAULT_PERMISSIONS` grants `solo` and `tester`
the `*` wildcard (`src/users/permissions.ts:57,81,83`), and
`applyGalleryAssetFilters` skips the whole visibility clause when
`isAdmin` (`gallery.ts:46-48`). Verified it is the role and not an ownership
artifact — same non-owner identity, varying only the role: `user`/`moderator`/
`viewer` → cannot see it, `solo`/`tester` → can. And it is not specific to
search: `serveGalleryGrid` behaves identically (both `false` at `user`, both
`true` at `solo`), so the two views stay in parity and the override is the
designed admin path. `authenticate.ts:161-176` only issues a solo context when
`authConfig.required === false`, i.e. single-user deployments. Flagged here so
the next reader does not rediscover it as a leak in this route.

**Tests — the boundary is demonstrated, not just a 200.**
`src/routes/views/plugin-dynamic.test.ts:129-135` asserts an HX-Request with
no derived user gets `401` on this exact route.
`src/routes/views/search.test.ts:104-116` inserts a `private` asset owned by
`mallory` and asserts `owner` does NOT get its card while `mallory` DOES —
cross-user exclusion, not a status check. Lines 98-102 assert an anonymous
search renders `gallery-empty`.
`bun test src/routes/views/search.test.ts src/routes/views/plugin-dynamic.test.ts`
→ 37 pass, 0 fail.


**Evidence isolation.** `createTestDb` allocates a fresh `new Database(":memory:")`
per call (`src/test-utils/create-test-db.ts:31`), so no fixed path is shared and
no port or on-disk collection is allocated. Each `describe` in
`search.test.ts` builds its own in `beforeAll` and closes it in `afterAll`
(`:25/:40`, `:144/:167`, `:223/:232`); `plugin-dynamic.test.ts:37/:51` does the
same, and its `makeApp` (`:24-31`) derives identity per-app rather than mutating
a global. Neither file uses `mock.module` or touches `process.env`, so neither
can poison a sibling. Checked rather than assumed: both together 37 pass; each
alone 21 and 16; `bun test --parallel=4 --isolate` 37 pass; the same two files
also pass inside a 6-file mixed run and again in reversed order, so the counts
are not order- or batching-dependent.

Fix commits, both confirmed ancestors of HEAD via
`git merge-base --is-ancestor <sha> HEAD` (exit 0): `8b4eae500`
`fix(auth): IDOR and visibility enforcement in routes and rate-limiting`
(2026-10-05) and `a66da50ac`.
