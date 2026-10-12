<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Triage knip src findings

**Status:** Not Started
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
