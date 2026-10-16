<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Triage knip src findings

**Status:** Done

> Superseded in full by `TASK-delete-or-wire-dead-modules-flagged-in-glm-review-sweep`, which re-ran knip on the live tree and triaged every finding: 57 deletions, 2 wirings, 2 gaged false positives, 8 recorded as owned-elsewhere. Sweep evidence: `bun run dead:code:src` exits 0 and this gate was flipped from `ADVISORY_GATES` to blocking in `scripts/check/parallel/gate-table.mjs`.
**Priority:** medium
**Effort:** Medium

**Summary:**

The knip dead-code gate now scans src/ (fix-knip-src-blindspot: knip.json project += src/**/*.ts, entry points for the migrations glob + browser bundle roots, dead:code scripts run knip --no-gitignore because src/.gitignore blanket-ignores the tree). First full scan reports, approximate at filing time - recompute at triage: ~30 unreferenced index.ts barrels (src/{admin,auth,autonomy,characters,...}/index.ts - AGENTS.md declares index.ts the public-API convention, so keep-vs-prune is a repo decision, not mechanical cleanup); ~45 possibly-unfinished non-barrel files (examples: generation/image-edit-service/* possibly superseded by src/image-edit/, rpg/{body,encounters,fantasies,...}, frontend/app.ts + vendor.ts - obsolete pre-alpine-init bundle roots still declared as knip entries); ~2.8k unused exports/types. The "dead - code (knip)" gate is RED until triaged. Options: per-symbol triage (keep/wire/remove) or temporary ADVISORY_GATES placement in scripts/check/parallel/gates.mjs. Directive from docs/meta/code-practices-improvements/knip-jscpd-research-2026-09-03.md: dead or duplicated code may be UNFINISHED functionality that gets connected later - triage keep-vs-wire-vs-remove; nothing is removed without confirmation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-16 registry-driven close: git issue 9b90505 (registry tip: b19eba765 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-TRIAGE-KNIP-SRC-FINDINGS do)
