<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: advertised /sfx /music /video commands are stubs

**Summary:** The /sfx, /music and /video stubs told the user a generation was queued, although nothing was generated.
**Context:** The de-advertising half of this ticket is done (the three stubs register with `available: false`, so `GET /api/commands` no longer lists them). What was left was the wording: `sfx.ts:25`, `music.ts:41-44` and `video.ts:23-26` returned "**Sound effect queued:**", "**Music generation queued:** ... The music will appear in the chat when ready." and "**Video generation queued:** ... The video will appear in the chat when ready." while the handler body is still `// TODO: Call ... generation provider` - nothing is queued and nothing appears later.

Fix: WORDING ONLY. The generation itself is deliberately not implemented (the stubs are a seam until an audio/video provider is configured, and the frontend toasts "not implemented" for the three actions in `src/frontend/alpine/chat-actions/dispatch.ts`). The commands now say plainly that generation is not implemented yet and that nothing was generated; the prompt is still echoed so the user does not lose it. The `action` / `actionPayload` contract is unchanged.

Not fixed here (out of scope): `TestingConfig.llamaSwapConfig` (`src/config/schema/testing.ts:16-17`) is declared but unread - it is the config surface reserved for the pending TASK-real-llm-sd-e2e-fixture-llama-cpp-llama-swap-sd-server (which lists that exact field as its fixture input), so it is not deleted here.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated


**Status:** Done
**Priority:** medium
**Effort:** Small

## Resolution

Fixed in `fix-batch-vn-assets-fe` (commit pending). De-advertise (plan A5 — no audio/video provider configured):

- `src/assistant/commands/registry.ts`: added `available: boolean` to `CommandOptions`/`CommandRegistration` (default `true`); `listCommands()` now filters to `reg.available` only.
- `src/assistant/commands/sfx.ts` (`/sfx` + `/sound` alias), `music.ts`, `video.ts`: registered with `{ available: false }` — still callable on direct input, no longer advertised.
- `GET /api/commands` (`src/routes/commands/index.ts`) flows through `listCommands()`, so the FE command palette stops listing the three stubs. FE "not implemented" toast branch retained (harmless — commands no longer advertised).
- Deleted dead mock `src/assistant/sd.ts` (zero production callers — grep verified; `image-engine/index.ts` `generateImages` is a different module).

Test: `src/routes/commands/index.test.ts` — "excludes stub commands registered with available:false" asserts a stub registered with `available: false` is absent from `GET /api/commands` while other commands remain. 15/15 pass, typecheck EXIT=0, dprint clean.

Follow-up (wording, this commit):

- Fix: `src/assistant/commands/music.ts:42-43`, `src/assistant/commands/sfx.ts:27-28`, `src/assistant/commands/video.ts:24-25` — the three stub messages no longer claim a generation was queued. They now read "**<X> generation is not implemented yet** — this command is a placeholder, so nothing was generated." and echo the prompt. The `action` / `actionPayload` contract is unchanged.
- Tests: `src/assistant/commands/generation-stubs.test.ts` — "/music does not claim a generation was queued", "/sfx does not claim a generation was queued", "/sound aliases /sfx", "/video does not claim a generation was queued". The test runs the real registered handler and asserts the message contains neither "queued" nor "will appear in the chat" and does say "not implemented yet".
  - Before the fix: 4 FAIL — e.g. `Expected to not contain: "queued"` / `Received: "**Music generation queued:** epic battle theme\n\nThe music will appear in the chat when ready."`.
  - After the fix: 4 PASS (verified by reverting the three messages in the worktree and re-running the test).
- `TestingConfig.llamaSwapConfig` is deliberately left in place: it is the fixture input reserved by the pending TASK-real-llm-sd-e2e-fixture-llama-cpp-llama-swap-sd-server, so deleting it here would remove a live owner’s config surface.

## Summary

src/assistant/commands/sfx.ts:25 (TODO audio provider), music.ts:41-44, video.ts:23-26 return 'queued'+action, but src/frontend/alpine/chat-actions/dispatch.ts:35-43 toasts 'not implemented' for all three; commands stay advertised via GET /api/commands. Fix: implement or de-advertise + remove dead mock src/assistant/sd.ts:77 (no production callers).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
