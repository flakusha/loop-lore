<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Filing batch notes — 2026-09-26

## Already-resolved tickets referenced by the audit

- D-02 (giwt finalize cannot name the failing gate): TASK-audit-follow-up-check-report-name-field-dropped (status: done). Cross-reference only; do NOT re-file.

## Withdrawn from this batch

- P-11 / L-8 (license gate reports ok when scancode/fossa are absent): NOT a defect. check-parallel.mjs:1263-1290 emits level: info with message "Neither scancode nor fossa installed - skipping". Recorded in .tmp/scratchpad-pattern-analysis-2026-09-26.md §7 row 20.

## Tickets filed in this batch (loop-lore side)

- D-01 / L-1: BUG-test-e2e-env-default-mismatch.md
- D-03 / L-10: BUG-test-async-store-offload-dir-fixed-path-race.md
- L-4: TASK-async-store-tests-per-test-tmpdir.md
- D-04 / L-3: TASK-async-store-retention-cap.md
- D-05 / G-7: TASK-giwt-show-state-resolve-plan-tickets-filename-slugs.md
- G-1: TASK-giwt-issues-gains-state-open-closed-all-filter.md
- P-08 / L-6: TASK-ticket-status-enum-and-migration.md
- P-10 / L-7: TASK-jscpd-ratchet-persistent-baseline.md
- P-05/P-13 / L-5/L-9: TASK-tmp-janitor-and-staleness-markers.md

## Cross-repo ticket references (informational only — no .plan/ reflection required)

> The following TASK identifiers are tracked in sibling repos (`../giwt`, `../omp-plugins`).
> They are NOT expected to resolve against `.plan/tickets/` in this checkout. The
> `links` gate treats them as informational; this fence block explicitly opts them out.

- `../giwt` (sibling repo, not tracked here): giwt-clean-doctor-runs-scratchpad (G-3+G-4+G-5); giwt-schema-contract-gate (G-6); giwt-plan-validate-status-vocab (G-8)
- `../omp-plugins` (sibling repo, not tracked here): omp-scratchpad-audit-and-session-artifacts (O-1+O-2); omp-ticket-finalize-find-work-hardening (O-3+O-4+O-5+O-6+O-7)

---

# Filing batch notes — 2026-09-26 (v2: plan-expansion)

Branch: `plan-expansion-2026-09-26-v2`. Worktree: `tree/plan-expansion-2026-09-26-v2/`.
Source backlog / matrix / epic triage driven by `.plan/backlog/open-*.md`,
`.plan/matrix-*.md`, `.plan/epics/`.

## Backlog triage (Subagent A — DomesticMoth)

11 new TASK/BUG tickets:

- BUG-idempotency-table-backend-verify-reproduces.md
- TASK-backlog-build-integrity-cluster-close-out.md
- TASK-backlog-untriaged-advisory-orphan-sweep-2026-09-25.md
- TASK-backlog-federation-interconnect-batch.md
- TASK-backlog-vn-sprite-staging-batch.md
- TASK-backlog-rpg-mechanics-opt-in-gating-priority.md
- TASK-backlog-coverage-waivers-frontend-batches.md
- TASK-backlog-item-generation-discoverability-batch.md
- TASK-backlog-workflow-gm-routing-batch.md
- TASK-backlog-size-strict-regression-recovery.md
- TASK-backlog-migration-hygiene-duplicate-prefix-gate.md

8 existing sparse tickets expanded in place: TASK-worldinfo-engine-parity,
TASK-worlds-extension, TASK-worldbook-rag-decomposer, TASK-totp-backup-codes-and-webauthn-mechanics,
TASK-transform-service-upsert-read-derived-default, TASK-transform-routes-validation-and-ownership-authz,
TASK-transform-tests-idempotency-precedence-authz, TASK-travel-routes-schema-crud.

## Feature matrix review (Subagent B — ExcessStingray)

10 new TASK tickets covering unimplemented matrix cells:

- TASK-matrix-cross-mech-g18-agentic-npc-autonomy.md (G18, P6+)
- TASK-matrix-cross-mech-g19-agent-memory-scoring.md (G19, P6+)
- TASK-matrix-cross-mech-g20-living-world-persistence.md (G20)
- TASK-matrix-cross-mech-g21-asset-consistency-generation.md (G21)
- TASK-matrix-cross-mech-g22-event-driven-automation.md (G22)
- TASK-matrix-cross-mech-g23-dynamic-memory-mid-response.md (G23)
- TASK-matrix-cross-mech-g46-interrupt-semantics.md (G46)
- TASK-matrix-auth-channel-ac3-capability-registry-naming.md (AC3 / [WAC1])
- TASK-matrix-auth-channel-ac4-matrix-bot-approval-session.md (AC4 / [WAC2])
- TASK-matrix-auth-channel-ac12-per-role-policy-shape.md (AC12)

## Epic audit (Subagent C — CheerfulMuskox)

7 epic files augmented with `## Integration Points`:
epic-message-seen-state, epic-conversation-branching, epic-two-factor-auth,
epic-realtime-transports, epic-cicd-pipeline, epic-economy-trading,
epic-platform-integrations.

6 existing sparse epics expanded: epic-schema, epic-cicd-pipeline,
epic-error-envelope, epic-io-formats, epic-logging, epic-licensing.

4 clarification tickets filed for stalled/outdated epics:
TASK-epic-frontend-component-architecture-clarification-2026-09-26,
TASK-epic-frontend-encryption-clarification-2026-09-26,
TASK-epic-transport-layer-expansion-clarification-2026-09-26,
TASK-epic-use-case-agentic-workspace-clarification-2026-09-26.

4 IDEA tickets filed for new epics (P6+ deferred):
IDEA-epic-tool-calling-mcp-2026-09-26, IDEA-epic-asset-consistency-generation-2026-09-26,
IDEA-epic-bdi-npc-autonomy-2026-09-26, IDEA-epic-npc-to-npc-social-2026-09-26.

## Reconcile-and-fix pass (Subagent LabourSnake)

Cleared 3 unfixable gates after the subagent batch landed:

- format gate: 50 tickets patched with `**Acceptance Criteria:**` (bold, exact format)
- links gate: 36 orphan TASK refs removed from expanded epics
- spdx gate: 17 imported-back tickets had SPDX header prepended
  (`giwt sync --fix --import-back` re-imports issue text but doesn't add headers — manual patch.)

## Verification (post-finalize)

`bun run plan:validate` reports `All gates pass (10 checked)` (64 advisory items remain).
`bun run check --gates <all-non-coverage>` reports `28/28 PASS` (coverage green after diff-base plan-expansion-2026-09-26-v2).
