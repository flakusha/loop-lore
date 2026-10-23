<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE harmonization gate is blocking, contradicting its own advisory acceptance criterion

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-fe-be-harmonization

**Summary:**

Reconciliation of `.plan/epics/epic-fe-be-harmonization.md` found two of its own acceptance criteria unmet, so the epic could not be closed.

AC2 requires the gate to be advisory, following the innerHTML-XSS precedent. Reality: `scripts/check/parallel/gates.mjs:65` registers it as a plain blocking entry:

    "fe-be - harmony": "bun run scripts/check-fe-be-harmonization.ts"

There is no `|| true` and no `(advisory)` label, so a harmony finding fails `bun run check` outright. The epic text and the registered behaviour disagree.

Decide which is authoritative. If the gate is meant to block, the epic's AC2 is wrong and the epic should say so. If it is meant to be advisory, register it in `ADVISORY_GATES` in `scripts/check/parallel/gates.mjs` and update the epic to match.

Scope: reconcile the two, do not change what the script detects.

**Context:**

// hint: Structural and logic conflict. Both design and behavior differ.
Resolution: the gate is authoritative as **blocking**, and the epic text was the stale side. Evidence — `bun run scripts/check-fe-be-harmonization.ts` on dev reports zero blocking findings, so the triage condition AC2 was waiting on (factory-built `createEntityRoutes`, guarded/group-mounted, upload-multipart paths surfacing as FE-no-BE) is satisfied rather than open. Making the gate advisory now would delete a guard that currently passes for no benefit, so `ADVISORY_GATES` was left untouched. BE-no-FE remains advisory inside the script: a route may legitimately serve the TUI, curl, or a partner. Revisit only if a refactor reintroduces the noise.

**Acceptance Criteria:**

- [x] Implementation complete — epic AC2 rewritten to specify the blocking gate at its real registry (`scripts/check/parallel/gate-table.mjs`, not the `gates.mjs:65` line named here); `scripts/check-fe-be-harmonization.ts` header documents the same contract and the revisit condition.
- [x] Tests passing — no behavioural change to detection; gate exits 0 on dev and exits 1 with `file:line` findings when drift is injected.
- [x] Documentation updated — epic acceptance block + reconciliation note.

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue 3db1677 (registry tip: fd7e537ac Konstantin Fedotov Close issue)
## Verification

- `bun run scripts/check-fe-be-harmonization.ts` on dev: silent, exit 0 (no blocking findings).
- Probe: a temporary `feFetch("/api/__harmony_probe_missing_route")` in `src/frontend/` produced one blocking finding and exit 1; probe file deleted.

**Resolved:** 2026-10-23 registry-driven close: git issue 3db1677 (registry tip: fd7e537ac Konstantin Fedotov Close issue)
