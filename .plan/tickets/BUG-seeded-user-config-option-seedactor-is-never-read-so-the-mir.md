<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Seeded-user config option seedActor is never read, so the mirror actor row is always created

**Status:** Not Started
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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
