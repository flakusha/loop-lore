<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Seeded-user config option seedActor is never read, so the mirror actor row is always created

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

**Summary:**

`SeedUserConfig.seedActor` is declared and documented as a switch, but no runtime code reads it. The seeded-user writer always inserts the mirror `actors` row, so an operator (or any programmatic Config builder) that asks for `seedActor: false` still gets the row.

**Evidence:**

- `src/config/schema/seeding.ts:38-39` — `/** Seed a mirror actor row (default true — required to own chats/entities). */ seedActor?: boolean;`
- `src/seeding/users.ts:85-176` — `seedSingleUser` reads only `username`, `password` and `role` from the config entry (`:90`, `:98`, `:108`, `:127`), and then always inserts the mirror actor row inside the transaction (`:136-151`).
- Repo-wide grep for `seedActor` returns only the schema declaration plus unrelated `seedActor(...)` test-helper functions of the same name in other modules — no reader of the config key.

**Failure scenario:**

A Config builder (headless CLI, plugin config, or a future config-file surface) sets `seeding.users[0].seedActor = false` to create a login-only user without a mirror actor. `seedConfiguredUsers` seeds it anyway and the mirror `actors` row exists. The config contract and the runtime behaviour disagree, and nothing reports the difference. Today the key is not in the generated config-file schemas, so the blast radius is limited to programmatic config use — but the exported type advertises a switch that does nothing.

**Proposed fix:**

Pick one side and make the code match: either honour the flag in `seedSingleUser` (skip the `actors` insert when `seedUser.seedActor === false`) or delete `seedActor` from `SeedUserConfig` and fix the docblock so the type stops advertising a no-op. The lazy fix is deletion — the mirror actor is described as required to own chats and entities, so a user without one has no useful role in the product.

**Context:**

`SeedUserConfig.seedActor` was declared and documented as a user-facing option ("Seed a mirror actor row (default true - required to own chats/entities)") but no runtime code read it: `seedSingleUser` always inserted the mirror `actors` row, so an operator (or any programmatic Config builder) that asked for `seedActor: false` still got the row.

Chosen fix: HONOUR the flag, not delete it.

- The option was designed to work: it is declared, documented, and reachable from the config file (the seeding section is parsed generically, so `seeding.users[].seedActor` reaches `seedSingleUser`). Honouring it makes the type honest.
- Deletion would change no runtime behaviour at all (the row was always created), so there would be nothing to regression-test, and every config that already sets `seedActor: false` would keep getting a row it explicitly did not ask for.
- The mirror actor stays the default (`seedActor` unset or true -> the row is created), so the product invariant (a seeded user can own chats/entities via `chat_participants.actor_id` -> `actors.id`) is untouched unless an operator opts out.

Scope note: `src/config/schema-class/json-schema/seeding.ts` still describes the users items with `handle`/`role` while the runtime type uses `username`/`password`/`role` - a separate, pre-existing schema drift that this ticket does not touch.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Fix: `src/seeding/users.ts:136-156` - the mirror `actors` insert is now conditional: `if (seedUser.seedActor !== false)`. An unset or `true` flag keeps today's behaviour (the row is created).
- Docblock: `src/config/schema/seeding.ts:38-41` - the option now says what it does ("Set to false to skip the mirror actor").
- Tests: `src/seeding/users.test.ts` - "seedActor: false skips the mirror actor row".
  - Before the fix: FAIL - the mirror actor row existed even with `seedActor: false` (`expect(received).toBeUndefined()` received the actor row).
  - After the fix: PASS - the opted-out user has no mirror actor, the default user still has one (the mirror actor's id is the user id, so the test looks it up by that id).
  - Verified by reverting the guard in the worktree and re-running the test.

**Resolved:** 2026-10-25 registry-driven close: git issue d71ac02 (registry tip: 381afc19b Konstantin Fedotov Auto-closed: appended .md marker marks BUG-SEEDED-USER-CONFIG-OPTION-SE)
