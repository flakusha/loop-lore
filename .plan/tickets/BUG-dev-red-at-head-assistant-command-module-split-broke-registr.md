<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Dev red at HEAD: assistant command-module split broke registration and e2e import; uncommitted repair must land via worktree

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Dev is RED at committed HEAD (1015c3a42): commit deedda3ce "refactor(assistant): split oversized command modules" broke (a) the frozen command-conformance vectors, (b) two unit test files relying on import side-effect registration, (c) the entire browser e2e suite via a missing `parseCharacterUpdates` export. An UNCOMMITTED 4-file repair (src/assistant/commands/characters-access.ts, characters-update.ts, items.ts, items-update.ts) sits on the protected dev checkout and makes the failing tests pass — it must land via worktree + full `bun run check`, never committed directly on dev. Also folds in T-5: `src/frontend/alpine/command-conformance.test.ts` passes only under `E2E_SAFEGUARD=1` (the gate's own invocation) and gives a false failure (missing every gated command) under bare `bun test` — normalize the fixture when fixing.

**Files:**

- src/assistant/commands/characters-access.ts, characters-update.ts, items.ts, items-update.ts (uncommitted repair, 4 files)
- src/frontend/alpine/command-conformance.test.ts:38
- src/assistant/commands/characters-access.test.ts:31
- src/assistant/commands/items.test.ts:33

**Evidence:**

- e2e (all ~40 spec files, 0 specs reach a browser): `SyntaxError: Export named 'parseCharacterUpdates' not found in module '.../src/assistant/commands/characters-access.ts'` (gates.md).
- characters-access.test.ts / items.test.ts: `error: command not registered: char-update` / `item-update` between tests (gates.md).
- command-conformance.test.ts:38: `expect(received).toEqual(expected) - "char-update" + "char-list" ...` ordering/entry drift post-split; post-fix verification: passes under `E2E_SAFEGUARD=1 bun test` (56 pass / 0 fail), fails under bare `bun test` (55/1) because the live registry is unpopulated without the env var (gates.md post-report update).
- `bun run check` @ 1015c3a42: 45 checks — 41 passed, 2 failed (`coverage - per-module line %`, `e2e - browser (baseline)`), report gitDirty: true.

**Fix:**

Move the 4-file working-tree repair into a worktree branch, commit via `giwt commit-wt`, run full `bun run check`, finalize. While there, make `command-conformance.test.ts` independent of `E2E_SAFEGUARD` (populate or skip deterministically so bare `bun test` matches the gate invocation).

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — README.md (B-1) + gates.md.

**Context:**

Repair landed as commit 308d71855 "fix(assistant): restore split module headers, break import cycle" — 4 files (characters-access.ts, characters-update.ts, items.ts, items-update.ts): SPDX headers restored and the import cycle broken by moving `parseCharacterUpdates` into characters-update.ts and `parseItemUpdates` into items-update.ts (the originals import and re-export them, so the registration order the frozen vectors encode is preserved). The frozen vectors file was not touched.

Second acceptance item verified: bare `bun test src/frontend/alpine/command-conformance.test.ts` (no `E2E_SAFEGUARD`) → 3 pass / 0 fail; the file carries no `E2E_SAFEGUARD` reference. The split — not the env var — is what had emptied the live registry. `bun test` over the five entity-command test files → 118 pass / 0 fail.

Documentation: `docs/spec/assistant-commands.md` documents the command framework and the apply/modify/add/clone/import family; it does not enumerate the world/location/character/item read commands, so no documented statement went stale and no doc change was required.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 2c64956 (registry tip: a4d1bc5fe Konstantin Fedotov Close issue)
