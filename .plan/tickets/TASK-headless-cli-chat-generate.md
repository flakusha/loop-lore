<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Headless CLI — chat + generate (`lolo chat|generate --json`)

**Status:** Done
**Resolution:** Implemented in bin/lolo.ts + src/cli/headless.ts with bun tests in bin/lolo.headless.test.ts (14 passing). Verified 9/9 live round-trip commands against createTestServer: chat create/send/history, generate (non-streaming pin), characters create/import, assets upload/link, chat send with attachment.
**Summary:** Non-interactive `lolo chat` and `lolo generate` subcommands with `--json` output (both **planned-new**).
**Context:** Gap 1 lead slice. `bin/lolo.ts` parses only `-h`; `src/tui/` already shows the HTTP pattern (Bearer `[tui].sessionToken`, `LOOP_LORE_API_BASE_URL`).
**Acceptance Criteria:** `lolo chat send --json`, `lolo generate --json` (both **planned-new**) work against solo-mode server; machine-parseable JSON output.

**Epic:** epic-interaction-surfaces-audit.md
**Type:** Feature | **Priority:** High | **Effort:** M

## Problem

No scriptable entry point for chat/generation: every scripted scenario needs hand-written HTTP (`POST /api/v1/chats/:id/messages`, `POST /api/v1/generation/generate`). Dogfood steps 2–4 cannot be scripted.

## Change

- Extend `bin/lolo.ts` with subcommand dispatch via the `src/cli/parser.ts` house rule (`@optique/run`): `lolo chat create|send|history`, `lolo generate [--stream]`, all **planned-new**.
- Reuse TUI auth plumbing: Bearer `[tui].sessionToken`, base URL `LOOP_LORE_API_BASE_URL` (default `http://localhost:3000`).
- `--json` flag: stdout is parseable JSON (`{ data }` / `{ error }`); non-zero exit on API error. Human-readable table output without the flag.
- Generation: pass through `idempotencyKey` (REQUIRED by `POST /generation/generate`); `--stream` consumes `GET /generation/stream/:chatId` SSE and prints concatenated text.

## Acceptance

- `lolo chat create --name x --json` → `{ "id" }`; `lolo chat send <id> -m hi --json` → `{ "id" }`; round-trips against solo-mode server.
- `lolo generate --chatId <id> --actorId <a> --prompt p --json` returns generation result; missing `idempotencyKey` auto-generated client-side.
- Failures (server down, 401, 429) exit non-zero with `{ "error" }` JSON on stdout.

## Non-goals

- Assets/characters subcommands (sibling ticket `TASK-headless-cli-assets-characters.md`).
- TUI changes; interactive prompts.
