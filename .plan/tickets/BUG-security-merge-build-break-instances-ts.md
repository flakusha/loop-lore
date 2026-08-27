<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Security/auth merge wrapper `3ab26ccd` breaks the backend build

**Status:** 🔧 In Progress (found in 2026-08-27 review of today's merges)
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
