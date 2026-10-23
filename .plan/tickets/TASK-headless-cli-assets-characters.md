<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Headless CLI — assets + characters (`lolo assets|characters --json`)

**Status:** Done
**Resolution:** Implemented in bin/lolo.ts + src/cli/headless.ts with bun tests in bin/lolo.headless.test.ts (14 passing). Verified live against createTestServer: assets upload/link (incl. duplicate:true re-upload path per ticket), characters create + card import round-trip with --avatar on the created actor.
**Summary:** Non-interactive `lolo assets` and `lolo characters` subcommands with `--json` output (both **planned-new**).
**Context:** Gap 1 lead slice, part B. Builds on the dispatch + auth + `--json` plumbing from `TASK-headless-cli-chat-generate.md`.
**Acceptance Criteria:** `lolo assets upload|link`, `lolo characters create|import` (all **planned-new**) work against solo-mode server with JSON output.

**Epic:** epic-interaction-surfaces-audit.md
**Type:** Feature | **Priority:** High | **Effort:** M

## Problem

Asset upload (`POST /api/v1/assets` multipart) and character create/import (`POST /api/v1/actors`, `POST /api/v1/actors/import`) are HTTP-only; dogfood avatar/asset steps cannot be scripted.

## Change

- `lolo assets upload <file> [--alt-text] --json` → multipart `POST /api/v1/assets`; prints `{ id, duplicate? }`.
- `lolo assets link <assetId> --chat <chatId> --json` → `POST /api/v1/assets/:id/links` (`{entityType:"chat",entityId}`).
- `lolo characters create --display-name N [fields…] --json` → `POST /api/v1/actors` (ActorCreateBody); `--avatar <assetId>` links avatar at create time.
- `lolo characters import <card.png|json|charx> --json` → multipart `POST /api/v1/actors/import`.

## Acceptance

- Upload → link → chat-send-with-attachment round-trips via CLI only; duplicate upload reports `duplicate: true`.
- Character create + card import round-trip; `--avatar` asset appears on the created actor.
- Same `--json` / exit-code contract as the chat/generate ticket.

## Non-goals

- Chat/generate subcommands (sibling ticket). Batch download/delete, wardrobe, emotion-avatar jobs.
