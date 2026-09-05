<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: advertised /sfx /music /video commands are stubs

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Small

## Resolution

Fixed in `fix-batch-vn-assets-fe` (commit pending). De-advertise (plan A5 — no audio/video provider configured):

- `src/assistant/commands/registry.ts`: added `available: boolean` to `CommandOptions`/`CommandRegistration` (default `true`); `listCommands()` now filters to `reg.available` only.
- `src/assistant/commands/sfx.ts` (`/sfx` + `/sound` alias), `music.ts`, `video.ts`: registered with `{ available: false }` — still callable on direct input, no longer advertised.
- `GET /api/commands` (`src/routes/commands/index.ts`) flows through `listCommands()`, so the FE command palette stops listing the three stubs. FE "not implemented" toast branch retained (harmless — commands no longer advertised).
- Deleted dead mock `src/assistant/sd.ts` (zero production callers — grep verified; `image-engine/index.ts` `generateImages` is a different module).

Test: `src/routes/commands/index.test.ts` — "excludes stub commands registered with available:false" asserts a stub registered with `available: false` is absent from `GET /api/commands` while other commands remain. 15/15 pass, typecheck EXIT=0, dprint clean.

## Summary

src/assistant/commands/sfx.ts:25 (TODO audio provider), music.ts:41-44, video.ts:23-26 return 'queued'+action, but src/frontend/alpine/chat-actions/dispatch.ts:35-43 toasts 'not implemented' for all three; commands stay advertised via GET /api/commands. Fix: implement or de-advertise + remove dead mock src/assistant/sd.ts:77 (no production callers).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
