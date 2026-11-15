<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Startup preparedness for all application parts

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Boot-phase analysis: services that warn-and-skip, missing graceful degrade, first-run detection branch. From Research-startup-preparedness.md. Links to epic-first-run-auto-setup.

**Context:**

Boot-phase audit of every application part, from `Research-startup-preparedness.md` (docs-only research, no code edits). The boot sequence is `src/server/start.ts:70-419` plus `src/server/init-background-services.ts:32-210`; 19 phases are enumerated in the research table.

What the audit found, and what is still missing:

(a) SERVICES THAT WARN-AND-SKIP. The external local backends auto-start and give up silently: llama.cpp (`src/services/server-external-manager/start-llama.ts:108` not found in PATH, `:116` port-in-use, `:148` not ready), llama-swap (`:177`, `:196`), sd.cpp (`start-sd.ts:124`, `:129`, `:155`). `initBackgroundServices` awaits them with `Promise.allSettled` (`init-background-services.ts:192`) and logs, never throws — so the instance boots "healthy" with none of the local backends running and no signal that any of them was skipped.

(b) MISSING GRACEFUL DEGRADE / READINESS SIGNAL. No off-capabilities line is emitted at `ready = true` (`start.ts:345`); the readiness summary ticket (`83b7049`) is Not Started. There is also no per-plugin readiness list (plugin loader failures are soft, `start.ts:339`), no SD-discovery hint when `providers.sd` stays unset (`start.ts:111-127`), no per-seed signal (`:215-220`), and no migration state in the readiness summary (`:208-209`). The harness turn queue is composed only when the ACP integration is enabled (`start.ts:276-286`); when it is disabled the singleton stays unset and the admin surface reads 503, with nothing in the readiness output explaining it.

(c) NO FIRST-RUN DETECTION BRANCH. `start.ts` has no first-run branch at all; first-run handling lives only in the ticket layer (C1 config promotion `183003a`, setup-state endpoint `205978b`, readiness summary `83b7049`). A fresh clone with no env vars still hard-fails at the PII gate (`package.json:14-15` sets no `NODE_ENV`; `packages/core/src/config/load/pii-safety.ts:16-22` treats unset as prod-like), so "first run" is currently an unrecoverable crash rather than a detected state.

Scope of this ticket: consolidate the audit into the first-run-auto-setup epic's surface — a single first-run detection branch at boot plus the off-capabilities readiness line that names the parts that warn-and-skipped (local backends not found, SD discovery empty, plugins failed to load, seeds failed, harness queue disabled). It consumes the checks module from `205978b` and does NOT duplicate the setup-state endpoint, the readiness gate FEAT, or the config writer.

Constraints: no new config surface (the existing setup-state checks module is the single source); warn-and-skip services must not become boot blockers; no per-service duplication of the checks module.

Alternatives considered: making local backends hard-required at boot — rejected, they are opt-in and port conflicts are transient; a separate startup diagnostics report — rejected, that is the boot-readiness-gate FEAT's scope, which consumes this ticket's output.

**Acceptance Criteria:**

- [ ] boot has an explicit first-run detection branch that distinguishes a fresh instance from an established one
- [ ] the readiness line at `ready = true` names the application parts that warn-and-skipped (llama.cpp / llama-swap / sd.cpp not started, SD discovery empty, plugins failed, seeds failed, harness queue disabled) with no secret values
- [ ] the readiness line is computed from the setup-state checks module, not a second list of capabilities
- [ ] a skipped local backend does not fail or delay boot
- [ ] unit test covers: no skipped parts -> no warning line; a skipped backend -> exactly one warning line naming it; a second boot check does not duplicate it
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
