<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: No gate checks that a declared config key has a reader, so write-only config options ship silently

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

**Summary:**\n\nConfig keys are declared as members of exported interfaces / section classes, and their readers are property accesses. No existing gate looks at either side, so a key that nothing reads ships silently — and typecheck cannot see it either, because an optional declared key is a perfectly valid type.\n\n**Mechanism — why every existing guard misses it:**\n\n- `knip` (the `dead - code (knip)` BLOCKING gate) analyses modules: unused files, exports, types, dependencies. Its unit of analysis is the exported SYMBOL. `SeedUserConfig.seedActor` is a MEMBER of an exported interface, and the read site `config.seedUser.seedActor` is a property access, not an import edge. knip has no member-level or property-read analysis, so a config key is structurally invisible to it — this is not a configuration gap that a knip flag can close.\n- `dead - code (src files)` covers unused MODULES only (`knip --include files`).\n- `tests - coverage gaps` (`scripts/check/test-gaps.mjs`) points the other way: it requires a test import edge for every runtime export, so it flags an export with NO test, never an export used only by tests.\n\n**Instances found by hand in this sweep (all still shipped):**\n\n- `SeedUserConfig.seedActor` — `src/config/schema/seeding.ts:38-39` (BUG-seeded-user-config-option-seedactor-is-never-read-so-the-mir).\n- `TestingConfig.llamaSwapConfig` — `src/config/schema/testing.ts:16-17`.\n- `server.host` plus the `HOST` env mapping — `src/config/schema/sections/server.ts` and `src/config/schema-class/env-map.ts:98` (BUG-server-host-config-and-host-env-override-are-dead-start-ts-n): the key parses, the env var maps, and `Bun.serve` binds 0.0.0.0 anyway.\n\n**Smallest check:** a script that, for each config key declared in the config source of truth (`src/config/sections/**`, and `src/config/schema/**` while that layer still exists — see the overlap note below), counts read sites (`.key` property access or `["key"]` lookup) outside the declaring file, and reports keys with zero readers. Keys that are read through dynamic construction get an explicit allowlist entry rather than a silent pass. The script lives at `scripts/check/config-key-readers.mjs` and is registered as a new gate id in `scripts/check/parallel/gate-table.mjs`.\n\n**Diff-scoped:** yes for the common case — scope to keys declared in config files the diff touches (a key added without a reader). It does NOT cover the reverse direction: a diff that deletes the last reader of a key declared in an untouched file. The whole-tree scan is cheap (a few hundred keys, one grep pass), so the honest option is to run it whole-tree and not narrow it; narrowing buys little and creates a false-green hole in the delete-reader direction.\n\n**Blocking vs advisory:** ADVISORY first — add the gate id to `ADVISORY_GATES` in `scripts/check/parallel/gate-table.mjs` with a committed allowlist, and promote it to blocking once the allowlist is stable and the finding list is empty. A gate that fires on day one is a gate people bypass by day two.\n\n**Overlap note:** `TASK-delete-duplicate-config-schema-shim-layers-dead-config-emitters-and-one-shot-migration` already lists write-only config keys for a ONE-TIME cleanup and proposes deleting `src/config/schema/` in favour of `src/config/sections/`. This ticket is the recurring guard, and it must point at the surviving layer (`src/config/sections/**`) so it survives that cleanup — do not re-file the cleanup.\n\n**Effort:** M — the script, the allowlist, the gate registration, one test.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
