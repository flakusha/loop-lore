<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Two gates read age_gate_accepted_at under divergent config keys with no single source of truth

**Status:** Done
**Status Note (2026-10-26 gate fallout):** the delegation to `getStatus(ageGate.*)` landed in `src/middleware/nsfw-gate/base-eval.ts`, and with it a documented semantic change: when `ageGate.enabled=false` (the default, and the state in which no `birth_date`/`age_gate_accepted_at` is ever stored — see `docs/frontend/age-gate.md`) the NSFW age component passes everyone, matching `checkAgeGate`'s no-op. The batch updated the `src/middleware/nsfw-gate/*` and `src/generation/auto-gen/*` suites to `initAgeGate({enabled:true})`, but `src/routes/nsfw/index.test.ts` ("underage user → 403") and `src/routes/assets.test.ts` (two batch-download NSFW-gate tests) still ran against the default-off store and now got 200. Both files now enable the age gate in `beforeAll` / reset it in `afterAll`, the same convention as the other NSFW-gate suites; the gate verdicts themselves are unchanged. Note for future hardening: a self-declared minor still passes when the operator disables age gating entirely — that is intentional parity with `checkAgeGate`, not an oversight.
**Priority:** high
**Effort:** Medium
**Caveats:** config-drift, stale-state, default-off-in-two-places
**Epic:** epic-frontend-age-gate

**Summary:**

Two independent gates read the same DB column `users.age_gate_accepted_at` but are keyed on entirely different configuration trees, so they can return contradictory verdicts for the same user.

Gate 1 is `checkAgeGate()` in `src/routes/chats/create.ts:35-46`. It guards `POST /api/v1/chats` (called at `create.ts:175-176`) and returns `forbidden('Age gate not passed')` — a JSON 403. It reads the `ageGate.*` config section (`ageGate.enabled` / `AGE_GATE_ENABLED`, `ageGate.minimumAge` / `AGE_GATE_MINIMUM_AGE`, `ageGate.mode` / `AGE_GATE_MODE`). Its runtime store (`src/age-gate/controller.ts:37`) is initialised with `enabled: false` — a second independent default-off.

Gate 2 is the NSFW base-eval in `src/middleware/nsfw-gate/base-eval.ts:67-69`. It returns `{ allowed: false, reason: "age_gate_not_accepted" }` and reads the `nsfw.*` config section (`nsfw.allowNsfw` / `NSFW_ALLOW_NSFW`, `nsfw.nsfwMinAge` / `NSFW_NSFW_MIN_AGE`). It reads `age_gate_accepted_at` directly and **never** consults the `ageGate.*` config section.

An operator who enables the age gate via `ageGate.enabled = true` but leaves `nsfw.nsfwMinAge` at a different value gets inconsistent enforcement. The default-off lives in two places: `src/config/sections/age-gate.ts:9` (`enabled = false`) and `src/age-gate/controller.ts:37` (in-memory store).

**Context:**

The age gate feature was built in two stages: first the explicit `ageGate.*` endpoint guard, then the NSFW gate which re-used the same column but under its own `nsfw.*` config key without consulting `ageGate.*`. Both read `age_gate_accepted_at` independently. Consolidating to a single source of truth requires the NSFW gate to stop reading `age_gate_accepted_at` directly and instead delegate to the `ageGate.*` config section, or both gates share a common helper. Dropping the dual-default-off by initialising `enabled` in exactly one place is a prerequisite.

**Acceptance Criteria:**

- [ ] `src/middleware/nsfw-gate/base-eval.ts` no longer reads `age_gate_accepted_at` directly; it delegates to the `ageGate.*` config section
- [ ] `checkAgeGate()` in `src/routes/chats/create.ts` and the NSFW base-eval return the same verdict for any given user
- [ ] Changing `nsfw.nsfwMinAge` alone does not change whether a user passes the age gate
- [ ] The default-off for `ageGate.enabled` is defined in exactly one place (runtime store), not also in the class field default
- [ ] A test covers: user with `age_gate_accepted_at` set passes both gates regardless of `nsfw.nsfwMinAge`; user without it is blocked by both

**Resolved:** 2026-10-26 registry-driven close: git issue b5ecf3f (registry tip: 9d5477924 Konstantin Fedotov Close issue)
