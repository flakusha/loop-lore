---
hash: 8f3a1c2

git issue: 8f7a2ea


**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `getEffectiveNsfw` returns `enabled: true` for users with no preferences row (phantom users)

**Status:** done
**Reason:** the `?? true` fallback is deliberate and documented in source at `src/nsfw/moderation-service/overrides.ts:54-57`: "No row → schema default nsfw_enabled=1 is 'enabled'. Keep the fallback in sync with that default; defaulting to false here caused hooks to globally block users who never explicitly opted out (see e2e-integration test)." The schema migration sets write-side default nsfw_enabled=1, which the `updatePreferences` path uses at first insert. Changing to `?? false` would re-introduce the regression the comment explicitly cites. The "phantom enabled" reading is by design — a new user with no preferences row matches the same schema default any persisted user starts from. No defect.

## Summary

`src/nsfw/moderation-service/overrides.ts:31` and `:57` — when a user has no
`nsfw_user_preferences` row, `getPreferences` returns `null`. The code then
defaults to an empty object `{}`, making `prefs?.nsfwEnabled` undefined, so
`?? true` fires — returning `enabled: true` for a user who has never opted in.
The reported NSFW state is semantically inverted for phantom users.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/nsfw/moderation-service/overrides.ts` | 31 | `getPreferences` returns null, `?? {}` creates empty object |
| `src/nsfw/moderation-service/overrides.ts` | 57 | `prefs?.nsfwEnabled ?? true` fires for phantom user |

```ts
// overrides.ts:31
const prefs = (await thisL.getPreferences(userId,)) ?? ({} as NsfwUserPrefs);
// prefs = {} for phantom user

// overrides.ts:57
return { enabled: prefs?.nsfwEnabled ?? true, source: "user_preference", };
// prefs?.nsfwEnabled is undefined → ?? true fires → enabled: true
```

## Existing-Ticket-Check

- No open ticket covers this specific override-cascade phantom-user read path.
- `BUG-nsfw-flag-side-effect-runs-before-access-check` (closed) covers hook
  ordering (flag runs before access check) — different surface.
- `BUG-nsfw-modactions-performedby-from-body` (closed) covers write-side
  performedBy impersonation — different surface.
- `BUG-admin-auxtelemetry-leaks-userid-chatid` (closed) covers admin telemetry
  raw error strings — same bug class but different surface (admin panel vs
  NSFW capability system).

## Impact

- `getEffectiveNsfw` reports `enabled: true` for a user with no preferences row.
- Cascades into `assertNsfwCapability` via the override hierarchy
  (chat → world → `getEffectiveNsfw` → capability grant). The consent check
  (`config.nsfw.consentRequired`) likely catches this in practice, but the
  reported state is incorrect and could mislead the admin panel or downstream
  logic that relies on `getEffectiveNsfw`.
- Inconsistency: before `updatePreferences` creates the row, read returns
  `true` from `?? true`; after the write, read returns `true` from the row —
  but via different code paths.

## Fix

Change the fallback from `true` to `false`:

```ts
// overrides.ts:57
return { enabled: prefs?.nsfwEnabled ?? false, source: "user_preference", };
```

A phantom user (no row) should be treated as not having opted in. The schema
migration sets `nsfw_enabled=1` as a write-side default on first insert
(`preferences.ts:71`), not a SQL DEFAULT — there is no SQL-level default for
this column. The `?? true` was introduced as a workaround for a regression
(hooks blocking non-opted-out users) that should be fixed at the write path,
not as a permanent semantic state.

## Acceptance Criteria

- [ ] `getEffectiveNsfw` returns `enabled: false` for a user with no
      `nsfw_user_preferences` row
- [ ] `getEffectiveNsfw` returns `enabled: true` after the same user calls
      `updatePreferences` with `nsfwEnabled: true`
- [ ] Existing tests pass; add test for phantom-user read path
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/` green
