<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: First-Run Auto-Setup (L0 Completion)

**Overview:** Close the L0 gap from auto-setup research round 3 (candidate C1, `.tmp/research/AutoSetup-Approaches.md` §7): a fresh clone plus plain `bun run start` (no env vars) must boot solo, defaults must be promoted into a real user-editable config file, and first boot must be observable. No dependencies.

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** setup, first-run, config, bootstrap, onboarding, pii, observability
**Depends on:** none
**Related Epics:** epic-provider-connection-wizard.md (L1 wizard consumes the shared checks module), epic-external-harness-acp.md (ACP harnesses consume machine-readable setup state; that epic itself carries no setup scope)

## Summary

Research round 3 verified that boot is shipped modulo one latent gate: `package.json:11-12` scripts set no `NODE_ENV`, `src/config/load/pii-safety.ts:16-22` treats unset as prod-like, and `resolvePiiSecret` throws before the dev fallback can apply (`pii-safety.ts:46-60`, called unconditionally at `src/config/load/load.ts:158`; empirically reproduced 2026-11-01). Defaults are also memory-only — no code path writes user config today (only codegen/cert `writeFileSync` in `src/config/`), so users edit a file that does not exist. This epic fixes the gate, promotes effective defaults (via `createConfigSchema()` `*_DEFAULTS`) to `config.local.yaml` on first boot with a skip-if-any-config-exists guard, and adds a boot readiness summary so off-capabilities are visible at `ready=true`.

## Scope

- First ticket: close the NODE_ENV/PII boot gate (promoted-random-secret path or `NODE_ENV=development` default in `start`/`dev` scripts — pick one, document the other) + write effective defaults to `config.local.yaml` + `bun run init` alias; secret handling per approaches §7 C1 (generated ≥32-char secrets only where prod validation demands them, chmod 0600, gitignored names, never plaintext beyond the deliberate generated values).
- Follow-up ticket: one off-capabilities log line at `ready=true` computed from the same checks module as the setup-state endpoint (`GET /api/v1/setup/state`, ticket below) — single source, no duplicated logic.
- Shared dependency: the setup-state endpoint ticket is filed under this epic because its checks module powers the readiness summary; it deliberately does NOT extend `/api/health` (pinned unauthenticated contract) and does not add a doctor CLI.

## Tickets

- `183003a` — TASK-config-init-close-pii-node-env-boot-gate-promote-defaults-to: close PII/NODE_ENV boot gate + promote defaults to config.local.yaml (priority: high)
- `83b7049` — TASK-boot-readiness-summary-off-capabilities-log-line-at-ready-tr: off-capabilities log line at ready=true (priority: medium)
- `205978b` — TASK-setup-state-endpoint-get-api-v1-setup-state-checks-id-ok-hin: GET /api/v1/setup/state {checks:[{id,ok,hint}]} (priority: high; shared single source for the readiness summary, /doctor, and the wizard epic)

## Boundaries / Related Epics

- **epic-external-harness-acp.md** — has no setup/bootstrap scope (task list verified 2026-11-01); its harness consumers read the machine-readable setup-state endpoint instead. The harness-acp per-user isolation gate ticket `e5ed173` (TASK-per-user-isolation-gate) stays execution-scoped; setup-state is the surface external harnesses consume to finish setup themselves (principle P6).
- **epic-provider-connection-wizard.md** — L1 builds on this epic's observability: the wizard consumes setup-state checks for its what-is-missing preview.
- Layering: L2 optional subsystems are already structurally opt-in (approaches §2 table); the missing piece was discovering what is off — covered by the setup-state endpoint, not by behavior changes here.

## Out of scope / anti-candidates

Recorded once here from approaches §7 (what NOT to build):

- **No HA-style multi-step core onboarding wizard** — the wizard surface is one provider step (epic-provider-connection-wizard); everything else is defaults + opt-in. Anti-goal: blocking chat on N screens.
- **No model bundling or auto-pull** (Ollama/KoboldCpp pattern) — BYO-provider is architecture (empty `generation.providers` default); a pre-pull would embed provider semantics in setup.
- **No native prebuilt CI artifacts for now** — the pure-TS fallback is silent and complete (`src/native/loader.ts:163-184`); revisit only on reported Windows performance pain. Related ticket `a9c13bd` (optional-dep packaging, Not Started) already tracks packaging opt-ins.
- **No doctor CLI as a second surface** — `src/cli/headless.ts` would just proxy the setup-state endpoint; keep one machine-readable source.
- **No boot-generated markdown runbook** — fails the machine-readable bar for ACP agent consumers.
- **No TLS non-OpenSSL fallback** — document the OpenSSL requirement instead; only reached when TLS is explicitly configured (`start.ts:180-188`).
- **No forced age-gate/auth onboarding** — both deliberately default off/solo (`sections/age-gate.ts:8-12`, `sections/auth.ts:6-22`).
- **No hot-rewrite of user config edits** — write-once promote + merge-on-upgrade; the hot-reload watcher (`src/config/hot-reload.ts`) stays read-directional.
- **L2/deferral adjacencies (referenced, not absorbed):** email deps as opt-in lazy import `e0155d5` (TASK-email-deps-as-opt-in-lazy-import-nodemailer-imapflow-openpgp); sidecar installer trio `17c9de6` / `dba938a` / `9bde045` (installer + node registration + de-hardcoding) — installer/packaging scope lives outside this epic.

## Open Questions

1. **Boot-gate fix option:** promoted-random-PII-secrets path vs `NODE_ENV=development` default in the `start`/`dev` scripts — the first ticket picks one and documents the other (approaches §7 C1 leaves both viable).
2. **Promoted-secret file flavor:** `config.local.yaml` vs `env.yaml` for the generated PII values (acceptance criteria allow either; decide at implementation time).
3. **Anonymous booleans mode config knob:** which config section owns the opt-in flag for unauthenticated setup-state access (observability vs server), decided alongside the endpoint implementation.
