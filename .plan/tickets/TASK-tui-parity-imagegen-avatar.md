<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI parity — image-gen + avatar attach

**Status:** Not Started
**Summary:** Nearest-value TUI parity: image generation action + asset attach/upload in the TUI.
**Context:** Gap 2. TUI (`src/tui/`) is chat-blocking-POST + read-only asset sidebar; Web UI already has `POST /api/v1/generation/image` and asset link/upload flows.
**Acceptance Criteria:** TUI can trigger image-gen and attach/upload an avatar without leaving the terminal.

**Epic:** epic-interaction-surfaces-audit.md
**Type:** Feature | **Priority:** Medium | **Effort:** L

## Problem

TUI has no image/caption generation calls, asset sidebar is GET-only (`src/tui/asset-view.ts` has no POST/PUT/DELETE), no characters/worlds. Highest dogfood value per audit: TUI image-gen + avatar attach.

## Change

- Image-gen action in TUI: call existing `POST /api/v1/generation/image`, show job progress (poll status or emotion-avatar-style SSE), insert result asset reference into composer.
- Asset sidebar: attach-to-chat (`POST /api/v1/assets/:id/links`) for the active chat; upload path via local file picker → multipart `POST /api/v1/assets`.
- Avatar attach: `lolo characters`-equivalent minimal flow is CLI-side (other ticket); TUI side needs only asset attach so a generated/uploaded image can become a chat attachment.
- Document remaining TUI gaps (no characters/worlds, blocking chat POST, admin limited to harness + model-roles) as Not Started follow-ups inside this ticket — no code for those.

## Acceptance

- From TUI: generate image from prompt → asset appears in sidebar → attach to active chat → sent message carries the attachment.
- Read-only paths unchanged; admin-gated endpoints still surface 403 as an error line.

## Non-goals

- TUI streaming chat (blocking POST stays), characters/worlds surfaces, full Web UI parity.
