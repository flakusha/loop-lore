<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cross-Platform Filesystem Path Guard (Windows/macOS)

**Status:** 🟡 Open
**Priority:** High
**Effort:** Small
**Type:** Task
**Tags:** cross-platform, windows, macos, security, filesystem
**Epic:** epic-cross-platform-portability.md

## Description

`src/assets/service/file-system.ts:23-28` path-traversal guard hardcodes `/home` and `/` separators (Linux-only). On Windows paths use `\` and roots like `C:\Users\…`; on macOS `/Users/…`. The guard misbehaves across OSes — and it is a security-sensitive path restriction, so incorrect behavior is a real risk on Windows/macOS.

## Fix

- Use `node:path` `sep` / `isAbsolute` instead of literal `/` in OS-path logic.
- Resolve the `forbidden` root via `os.homedir()` / platform-appropriate base, not a hardcoded `/home`.
- Preserve Linux semantics (block `/home` root + direct children, allow deeper paths) on each OS.

## Acceptance Criteria

- [ ] Guard uses `node:path` APIs (no hardcoded `/` separators in OS-path logic)
- [ ] Unit test covers Windows, macOS, and Linux path shapes (block + allow cases)
- [ ] Existing Linux behavior unchanged (regression test green)

## Files

- `src/assets/service/file-system.ts`
- `src/assets/service/file-system.test.ts` (new or extend)
