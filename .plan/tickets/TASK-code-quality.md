<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Code Quality & Best Practices

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Continuous
**Epic:** epic-code-quality

## Summary

Ongoing code quality improvements — lint rules, type coverage, formatting, and best practices enforcement. Permanently ongoing epic tracking continuous quality work.

## Acceptance Criteria

- [ ] Lint rules current and enforced
- [ ] Type coverage at or above threshold
- [ ] Formatting consistent across repo
- [ ] No new lint/typecheck errors

## Linked Epics

- `epic-code-quality.md`
- `epic-continuous-improvement.md` — active cleanup epic (lint errors, TS error, dist artifact, test failures)
- `epic-frontend-bundle-optimization.md` — frontend JS bundle size reduction (1.34MB → <260KB)

## Linked Tickets

### God-File Splitting

- `TASK-split-messages-route.md` — Split `src/routes/messages.ts` (1013L) into domain modules
- `TASK-split-generate-route.md` — Split `src/generation/generate-route.ts` (736L) into pipeline steps
- `TASK-split-config-schema.md` — Split `src/config/schema.ts` (812L) by domain
- `TASK-split-server.ts.md` — Split `src/server.ts` (640L) into focused modules
- `TASK-split-utils-god-module.md` — Break `src/utils.ts` god module (~52 importers)
- `TASK-split-logger-god-module.md` — Break `src/logger/index.ts` god module (~59 importers)

### Frontend Bundle Optimization

- `TASK-frontend-bundle-analysis.md` — Analyze bundle composition and identify bloat
- `TASK-frontend-lazy-pages.md` — Lazy-load page bundles (code-split by route)
- `TASK-frontend-lazy-vendor.md` — Lazy-load vendor chunks
- `TASK-frontend-dedup-chunks.md` — Extract shared utilities into deduplicated chunk
- `TASK-frontend-compression.md` — Enable gzip/brotli pre-compression in build pipeline
- `TASK-frontend-size-gate.md` — Add bundle size CI gate
- `TASK-frontend-tree-shake.md` — Tree-shake unused dependencies

### Size Enforcement

- `TASK-promote-size-check-to-ci.md` — Promote `check-file-size.ts` from warn to CI gate
