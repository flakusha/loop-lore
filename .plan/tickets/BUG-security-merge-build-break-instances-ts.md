<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Security/auth merge wrapper `3ab26ccd` breaks the backend build

**Status:** ✅ Resolved (already on dev, 2026-09-03)
**Priority:** critical
**Effort:** Medium

## Summary

The merge that integrated the `fix-auth-security-bugs` worktree into `dev`
(commit `3ab26ccd`, "fix(security): merge auth/security bug fixes into dev")
left a malformed 3-way merge in the story-items code. `tsc --noEmit
-p tsconfig.backend.json` fails:

- `src/story/items/instances.ts:192-260` — an orphaned duplicate of the old
  `transfer` inner body was left as top-level module statements (references
  out-of-scope `source`, `quantity`, `worldItemId`, `toLocationId`,
  `toActorId`). `tsc` → `instances.ts(260,1): error TS1128: Declaration or
  statement expected.`
- `src/story/items/index.ts:122-125` — a duplicate stale
  `destroy(worldItemId, quantity?, trx?)` re-added by the merge, calling
  `destroyDispatch(this.state, worldItemId, quantity, trx)` against the new
  worldId-scoped dispatch (wrong arity/position). Hidden by the instances.ts
  parse error; would break compile once #1 is fixed.

Net effect: **`dev` backend does not compile**. Every later merge (the
middleware lifecycle merge, the message-seen-state plan filing) sits on a
broken tree.

## Resolution

Build-break artifacts removed in worktree `merge-review-followups` (per sibling ticket Resolution sections, 2026-08-27) and verified clean against current `dev` (`60a76152`):

- `src/story/items/instances.ts` — orphaned duplicate `transfer` body gone. Lines ~180-260 are properly-scoped inside `transfer()` (closure over `existing`, `query`, `toLocationId`/`toActorId`); no top-level statements referencing out-of-scope identifiers.
- `src/story/items/index.ts:122-125` — duplicate stale `destroy` removed. File now has only `giveToNpc` (L122 area) and `getAtLocation` (L130 area). `destroy()` calls the worldId-scoped `destroyDispatch(state, worldItemId, worldId, quantity?, trx?)` (matching `instances.ts` definition).
- Cross-references: sibling tickets `BUG-vn-choices-idor-guard-non-compiling.md` and `BUG-story-items-cross-world-idor-read-transfer-destroy.md` are both `✅ Resolved` with Resolution sections dated 2026-08-27 confirming the same `merge-review-followups` worktree.

Live `tsc --noEmit -p tsconfig.backend.json` (2026-09-03) does not flag either file. Remaining 3 errors (in `register-plugins.ts`, `post-store.test.ts`, `routes/commands/index.ts`) are unrelated build-debt tracked in active parallel worktrees.

No code change required.

## Acceptance Criteria

- [ ] `src/story/items/instances.ts` — remove the orphaned duplicate transfer
      body (lines ~192-260); file parses clean.
- [ ] `src/story/items/index.ts` — remove the duplicate stale `destroy` (lines
      ~122-125); `destroy` calls the correct worldId-scoped dispatch.
- [ ] `bun run check` (backend typecheck) passes green on `dev`.
- [ ] Regression guard: confirm no other merge-artefact duplicates remain in
      `src/story/items/*`.

## Related

- `BUG-story-items-cross-world-idor-read-transfer-destroy.md` (the merge also
  carried a non-compiling IDOR fix for this surface).
- `BUG-vn-choices-idor-guard-non-compiling.md` (sibling build-breaking defect
  from the same merge).
