<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Close the first-boot PII config gate and expose setup state

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-first-run-auto-setup.md
**Tags:** first-run, config, boot

**Summary:**

`packages/core/src/config/load/pii-safety.ts:19-22` treats unset NODE_ENV as prod-like, and `load.ts:158` validates unconditionally — a fresh clone with an empty environment fails to boot, breaking the 1.0.0 thesis that `bun install` plus `bun run start` just works. Note: an earlier ticket (TASK-config-init-close-pii-node-env-boot-gate-promote-defaults-to) cites the old `src/config/load/` path; the code has moved to `packages/core/src/config/load/` — use the new path in this ticket.

Scope: make unset-NODE_ENV a supported first-run state with a deterministic, documented outcome (pick the promoted-random-secret path or the `NODE_ENV=development` default per the epic's open question; document the other); promote the effective defaults into a real user-editable config file on first boot; expose `GET /api/v1/setup/state` reporting which configuration is missing. Builds on epic-first-run-auto-setup.md (Not Started) and the existing setup-state endpoint ticket (TASK-setup-state-endpoint-get-api-v1-setup-state-checks-id-ok-hin), whose checks module is the single source for both the readiness summary and the endpoint.

Out of scope: the provider-connection wizard, model bundling/auto-pull, HA-style onboarding — per the epic's anti-candidates.

**Caveats:** TOCTOU: first-boot promotion is write-once with a skip-if-any-config-exists guard; concurrent first boots serialize on the guard. Security: generated secrets are >= 32 chars, chmod 0600, gitignored names, never plaintext beyond the deliberate generated values; auth stays default-off. Authorization: setup-state endpoint keeps its admin guard; no anonymous hint leakage. Parallelism: promotion runs once at boot; idempotent re-runs are no-ops. Partial failure: a failed promotion never blocks boot — boot outcome stays deterministic and the endpoint reports what is missing. Rollback: deleting the promoted file restores fresh-clone behavior. Observability: boot logs the chosen outcome; the endpoint reports missing configuration machine-readably.

**Context:**

Why this ordering: the boot gate is the single most concrete first-run bug — nothing else in the first-run story matters until an empty env boots. The setup-state surface already exists as a ticket; this ticket wires the boot outcome to it instead of inventing a second surface.

**Acceptance Criteria:**

- [ ] Empty-env boot (`env -u NODE_ENV`, no config files) is deterministic and documented: it boots with a stated outcome, never a PII-secret throw.
- [ ] `GET /api/v1/setup/state` reports the missing configuration on a fresh clone.
- [ ] Re-run with any pre-existing config file leaves the file untouched (idempotence).
- [ ] Regression test on the empty-env boot path.

**Related:** TASK-config-init-close-pii-node-env-boot-gate-promote-defaults-to.md, TASK-setup-state-endpoint-get-api-v1-setup-state-checks-id-ok-hin.md, epic-first-run-auto-setup.md
