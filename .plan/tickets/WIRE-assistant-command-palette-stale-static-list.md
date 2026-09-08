<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: command-palette FE list hardcoded (drift from BE registry)

**Status:** ✅ Done (verified: GET /api/commands in src/routes/commands/index.ts wired via register-plugins.ts:188; palette hydrates on init in src/frontend/alpine/chat-actions/command-palette.ts; 54 pass incl. commands route + improve/translate/rewrite suites)
**Priority:** medium
**Priority Tier:** P3
**Effort:** Medium
**Area:** assistant
**Source:** reconcile review (Scout Batch A — ISSUE-7)

## Evidence

`src/frontend/alpine/chat-actions/command-palette.ts:11-28` — `_commandList` is a hardcoded array of 22 commands (`sfx`, `sound`, `music`, `caption`, `video`, `quest`, etc.); no dynamic fetch from `/api/commands`.

## Impact

New server-side commands added via `src/assistant/commands/registry.ts` are missing from the palette. Drift accumulates.

## Fix

- Add `GET /api/commands` returning the live registry of `BUILTIN_COMMANDS` + plugin contributions.
- Have the command-palette fetch on init and use the response.

## Verification

- Unit test for the new endpoint covering builtin + dynamic commands.
- Add a single playwright spec that asserts the FE list matches the BE registry.

## Acceptance Criteria

- [ ] `/api/commands` endpoint exists
- [ ] FE list hydrates from endpoint on init
- [ ] Adding a new server command shows up in the palette without FE rebuild
