<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Image backends x assistant: /image command backend routing + failure UX validation

**Status:** Not Started
**Priority:** medium
**Effort:** Small-Medium (validation + UX decision + wiring)
**Epic:** epic-frontend-gallery.md
**Summary:** Validate the assistant-to-backend path for image generation across sd.cpp, ComfyUI (standalone/proxy), external OpenAI-compatible. Ground state: `/image` (src/assistant/commands/image.ts) returns a generate-image action dispatched by FE (chat-actions/dispatch.ts:65) to `POST /api/v1/generation/image` with `{prompt, chatId}` — backend selection happens server-side via `pickSdProvider` purpose=generate (first-match/both fallback, NOT user-visible).
**Context:** Image-backends cross-cutting audit (2026-09-25). Open questions: (1) user cannot choose/see which backend serves the request — validate whether actionPayload should carry a backend hint + whether the server should echo the resolved backend in the response; (2) failure UX differs per backend (ComfyUI queue wait vs sd.cpp load vs external 429) — validate error shapes and surfaced messages.

**Acceptance Criteria:**
- [ ] Decision recorded: backend hint in actionPayload (yes/no + rationale); if yes, wired end-to-end.
- [ ] Server echoes resolved backend in the generation response (or decision documented why not).
- [ ] Failure UX validated per backend: queue-wait, load-timeout, and 429 paths surface distinct, actionable messages.
- [ ] Tests cover the routing echo + failure shapes.
- [ ] `bun run check` green.

**Tags:** image-backends, assistant, routing, ux
**Related:** src/assistant/commands/image.ts, src/frontend/alpine/chat-actions/dispatch.ts, pickSdProvider


git issue: d04e7b0
