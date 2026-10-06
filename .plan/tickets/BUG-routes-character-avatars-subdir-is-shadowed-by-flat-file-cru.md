<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: routes/character-avatars subdir is shadowed by flat file; crud/select/config routes never mount

**Effort:** Medium
**Summary:** src/routes/character-avatars/ is unreachable at runtime because the sibling flat file shadows it during module resolution
**Context:** Bun and Node resolve `X.ts` before `X/index.ts`, so every import of the character-avatars stem loads the flat file and the subdir barrel never executes
**Acceptance Criteria:** src/routes/character-avatars/ is either deleted (with TASK-frontend-char-avatar-config and BUG-avatar-select-empty-throws-no-frontend-fallback repointed at src/routes/character-avatars.ts) or adopted as the live implementation (with a prefix parameter threaded through characterAvatarsRoutes and its crud/select/config sub-plugins). Either way, `bun require.resolve ./src/routes/character-avatars` and the module actually loaded must agree, and routes/v1 actor avatar routes must continue to mount under /api/v1.


**Status:** Done
**Priority:** high
**Tags:** routes, module-resolution, dead-code

## Summary

src/routes/character-avatars/ (config.ts, crud.ts, select.ts, types.ts, index.ts) is unreachable at runtime.

Root cause: Node/Bun module resolution prefers the FILE over the DIRECTORY. Every import of '../routes/character-avatars' or './character-avatars' resolves to src/routes/character-avatars.ts, never to src/routes/character-avatars/index.ts. Verified with bun require.resolve on dev @ ee78014de: all four collision stems (actor-items, character-avatars, character-traits, http-utils) resolve to the flat .ts file.

Impact:
1. The subdir barrel registers characterAvatarsRoutes(opts) with NO prefix parameter, while the live flat file has characterAvatarsRoutes(opts, prefix = '/api'). routes/v1/actors-surface.ts:16 calls characterAvatarsRoutes(handleOpts, prefix) with prefix='/api/v1'. If resolution ever flips to the subdir (e.g. someone deletes the flat file, or a bundler resolves dirs first), every avatar route silently mounts at /api instead of /api/v1 — a live v1 API break with no type error, since JS ignores the extra arg.
2. The crud/select/config route split described by TASK-frontend-char-avatar-config and BUG-avatar-select-empty-throws-no-frontend-fallback (.plan/code-map.json) is not registered anywhere. The equivalent logic is duplicated inline in the 245-line flat file.

Fix options (not decided):
- Delete the subdir and repoint the two tickets at src/routes/character-avatars.ts, redoing their work against the flat file.
- Adopt the subdir: delete the flat file, promote the subdir barrel, and add the prefix parameter to characterAvatarsRoutes + its three sub-plugins.

Also applies to src/routes/character-traits/ (index.ts barrel was dead for the same reason; removed in the same pass along with its only-exclusive dependents bulk.ts and types.ts).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Verified fixed by code reading and focused tests against dev:

- The shadowed `src/routes/character-avatars/` subdirectory has been deleted.
- The flat `src/routes/character-avatars.ts` mounts the avatar routes via its config and extra plugins, with the prefix parameter correctly threaded through from `routes/v1/actors-surface.ts`.
- Pinned by `src/routes/character-avatars.test.ts`, which resolves the module and asserts the routes mount at the correct `/api/v1` prefix.
