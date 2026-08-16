<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Single-Binary Build (bun build --compile)

**Status:** 🟡 Open
**Priority:** Medium
**Effort:** Medium
**Type:** Task
**Tags:** cross-platform, build, compile, single-binary, bun
**Epic:** epic-cross-platform-portability.md

## Description

Produce a standalone executable so end users run loop-lore without a Bun/Node toolchain. `bun build --compile` bundles the entry but does NOT auto-embed arbitrary files (e.g. `dist/public` static assets, config defaults). Config/DB path resolution under the compiled context (`import.meta.dir`, `process.cwd()`, env overrides) must be verified.

## Fix

- Spike `bun build --compile --target=bun src/server/index.ts` on each OS.
- Verify config load + DB path resolution when run from an arbitrary cwd.
- Decide static-asset strategy: embed via `Bun.embed` / build-time injection, or document shipping an external `public/` directory alongside the binary.
- Update `src/server/static-files.ts` loader accordingly.

## Acceptance Criteria

- [ ] `bun build --compile` artifact produced on Windows + macOS + Linux
- [ ] Artifact boots, migrates DB, and serves the UI from a clean cwd
- [ ] Asset strategy documented + implemented (embedded or external)

## Files

- `src/server/index.ts` (entry)
- `src/server/static-files.ts` (asset loader)
- `package.json` (build:binary script)
- `epic-deno-support.md` (Deno compile alternative, T2.3)
