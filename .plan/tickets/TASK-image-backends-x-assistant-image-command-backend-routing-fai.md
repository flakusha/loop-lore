<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Image backends x assistant: /image command backend routing + failure UX validation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-plugin
**Tags:** assistant, routing, ux

**Summary:** Validate the assistant `/image` → backend path: routing visibility, per-backend failure UX, unlinked-generation policy.

**Context:**

Validate the assistant-to-backend path for image generation across sd.cpp, ComfyUI (standalone/proxy), external OpenAI-compatible. Ground state: /image (src/assistant/commands/image.ts) returns a generate-image action dispatched by FE (chat-actions/dispatch.ts:65) to POST /api/v1/generation/image with {prompt, chatId} — backend selection happens server-side via pickSdProvider purpose=generate (first-match/both fallback, NOT user-visible). Open: (1) user cannot choose/see which backend serves the request (ComfyUI vs sd.cpp vs external) — validate whether actionPayload should carry a backend hint + whether server should echo resolved backend in response; (2) failure UX per backend differs (ComfyUI queue wait vs sd.cpp load vs external 429) — validate error shapes + retry guidance surfaced to chat; (3) /image has no authz of its own (relies on route 401 + chat gate) — confirm no bypass when chatId omitted (unlinked generation: who may generate, quota?). Tests: dispatch-to-route contract per backend family, error-shape matrix, unlinked-generation policy.

**Acceptance Criteria:**

- [ ] Backend visibility decision (hint + echo or documented no)
- [ ] Error-shape matrix per backend family with chat-surfaced retry guidance
- [ ] Unlinked-generation policy confirmed (or fix ticket filed)
- [ ] Tests: dispatch contract, error matrix
- [ ] Documentation updated
