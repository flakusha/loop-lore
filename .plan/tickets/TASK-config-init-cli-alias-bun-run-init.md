<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Config init CLI alias (bun run init)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add bun run init alias that runs the same promotion writer as first boot, prints generated file path, exits 0. --force overwrites (default refuses). Depends on C1 writer. Gap G11.

**Context:**

Today the promoted config file only appears as a side effect of booting the server. There is no way to (re)generate it explicitly without starting the app, and no way to deliberately overwrite a stale promoted file. Users editing a file that does not exist (or a stale one) have no supported remedy.

Constraints:
- One writer, one code path — the CLI calls the C1 promotion writer; no duplicated YAML/secret-generation logic.
- The skip-if-any-config-exists guard stays the default; `--force` is the only override and must be explicit.
- Generated secrets follow the C1 rules (>=32 chars, chmod 0600, gitignored file names only).
- Pure Bun APIs, no OpenSSL dependency on the default path (Windows/Linux/macOS).

Alternatives considered: a separate `init` CLI entry under `src/cli/` that re-implements promotion — rejected (two writers drift); a `doctor`-style command — rejected (the epic records no second surface; the setup-state endpoint is the machine-readable one).

**Acceptance Criteria:**

- [ ] `bun run init` on a fresh clone (no config files) writes the promoted file, prints its path, and exits 0
- [ ] `bun run init` with a pre-existing config file refuses, prints an explanatory message, leaves files untouched, and exits non-zero
- [ ] `bun run init --force` overwrites the promoted file and exits 0
- [ ] the CLI and first boot produce identical promoted content for the same default set (single writer)
- [ ] generated secrets are >=32 chars and the file is chmod 0600 under a gitignored name
- [ ] works on Windows/Linux/macOS (pure Bun APIs)
- [ ] unit test covers: fresh write, refusal without --force, overwrite with --force
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
