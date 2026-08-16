<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Remove dist/server.js Build Artifact

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-continuous-improvement

## Summary

Remove stale `dist/server.js` (3.8MB) from disk and add `dist/` to `.gitignore`. The file is a build artifact from `build:server` script — not needed for development, not exported, not in bin.

## Current State

- `dist/server.js` exists on disk (3.8MB, built 2026-07-18) — stale artifact
- `dist/public/` also exists (build output)
- `dist/` **IS** in `.gitignore` (line 4) — no action needed
- `dist/` is NOT git-tracked (git ls-files returns nothing)
- No `exports` or `bin` entry in package.json references dist/
- `build:server` script creates it: `bun build src/server.ts --outdir ./dist --target bun`

## Execution Plan

1. `rm -rf dist/` — remove stale build artifact
2. Verify `bun run build:server` still works (rebuilds cleanly)
3. Optionally: add `clean` script: `"clean": "rm -rf dist/"`

## Acceptance Criteria

- [ ] `dist/` directory removed
- [ ] `bun run build:server` still works
- [ ] No other scripts reference dist/ in a broken way

## Files

- `.gitignore`
- `dist/server.js` (remove)
- `dist/public/` (remove)
- `package.json` (optional: add clean script)
