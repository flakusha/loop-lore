<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: db-type-postgres-accepted-but-no-postgres-runtime

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-multi-instance-reconciliation.md
**Tags:** config, db, postgres, boot, guard, honesty

**Summary:**

db.type=postgres passes config validation, but the runtime is always SQLite — and the multi-instance safety guard that fires on a shared database recommends exactly that unsupported setting as its remedy. The operator's setting is silently ignored, and following the app's own advice disables the only protection while changing nothing.

Closes finding F8 (report 01 §(c): the guard is opt-in and its stated remedy does not exist) and finding R4 (report 05 §(d): db.type=postgres is accepted while the runtime is always SQLite).

**Depends on:** none — warning-only; files standalone. Docker packaging and Postgres are deferred by operator directive 2026-11-16.

Explicitly NOT building:

- A Postgres dialect, driver or migration path (deferred to the Docker bundle).
- A hard boot rejection of db.type=postgres (deferred with the Docker bundle — deploy/docker-compose.yml sets DB_TYPE=postgres today, so a rejection would stop the container stack booting).
- Automatic Postgres provisioning or a compose rewrite.
- Multi-provider database abstraction.

**Caveats:** compose stack sets DB_TYPE=postgres (out of scope — the warning must not break it), boot-time warning volume, guard default-on scope

**Context:**

- packages/core/src/config/sections/database.ts:36 accepts db.type values including postgres; packages/core/src/config/schema-class/validate.ts does not reject it.
- src/db/index.ts:200 only logs a warning and continues; src/db/index.ts:5 imports the SQLite driver unconditionally, so db.type never changes the runtime.
- packages/core/src/config/load/safety.ts:63-95 is the multi-instance guard: it counts INSTANCE_COUNT and, when more than one process shares a database path, prints a warning whose remedy is "switch to postgres". That remedy does not exist in this codebase.
- The guard is opt-in (INSTANCE_COUNT must be set explicitly), so the default posture is "no protection".

Minimal fix (warning-only scope): log a loud boot warning that db.type=postgres is unsupported here, name sqlite as the supported value, and keep booting on SQLite; make the multi-instance guard default-on for the resolved database path and remove the Postgres advice from the warning text. The hard rejection plus the compose correction return with the Docker bundle.

**Acceptance Criteria:**

- [ ] Booting with db.type=postgres logs a loud warning naming sqlite as the supported value; boot still succeeds on SQLite.
- [ ] The multi-instance guard message no longer recommends Postgres.
- [ ] The guard is active by default for the resolved database path, without requiring INSTANCE_COUNT to be set.
- [ ] The operator guide states which db.type values are supported and what the multi-instance guard does.
- [ ] Tests passing, documentation updated.
