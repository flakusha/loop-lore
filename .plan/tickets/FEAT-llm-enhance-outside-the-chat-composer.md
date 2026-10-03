<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: LLM-enhance outside the chat composer

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-composer-flows

**Summary:** Extract the composer-bound LLM enhance action so it can be called from any free-text surface in the UI (world/lore fields, quest descriptions, persona bios, GM notes, etc.), not just the chat composer textarea.

**Context:**

`src/frontend/alpine/chat-actions/prompt-improve.ts` exposes `improvePrompt()` and `restorePromptDraft()`, but both read `this.$refs.messageInput` — a hard binding to the chat composer's textarea (`#message-input`). The same leveled-rewrite service (`POST /api/v1/generation/prompt`) is equally useful on other surfaces:

- `src/views/world-edit.html` — world description (`#edit-description`), lore (`#edit-lore`), location descriptions (`#loc-desc`, inline edit textarea in location list)
- `src/views/personas.html` — persona description textarea
- `src/views/quests.html` — quest description textareas (`createDescription`, `editDescription`)
- `src/views/world-detail.html` — timeline description textarea (`#tl-desc`)
- `src/views/partials/character-growth-editor.html` — arc description textarea
- `src/views/blog.html` — blog post body textarea
- `src/frontend/alpine/actor-entities.ts` — item content, entity content, note content fields (`x-model` bindings via `fields` descriptor array)

The goal: make the action reusable (input element + string in, rewritten string out) so any surface can offer Improve/Analyze without copying the service logic. Keep the non-destructive preview/undo behavior and local-first browser inference.

**Out of scope:** Auto-send of enhanced text — the enhanced value replaces the draft in-place, same as the composer behavior.

**Dependencies:**
- TASK-enhance-preview-shared-draft-store.md (shared client draft-version store for multi-level undo — the improve undo stack should eventually use this)
- FEAT-llm-enhance-for-chat-and-text-windows-with-leveled-rewrites.md (shipped composer-side baseline)

**Acceptance Criteria:**

- [ ] A standalone `enhanceText(text: string, level?: string): Promise<string>` function exists that takes raw text in and returns rewritten text, with no `$refs` or Alpine state dependencies
- [ ] The function runs local inference when eligible (same `shouldOffloadTask` gate as the composer version) and falls back to the server `POST /api/v1/generation/prompt`
- [ ] An `UndoEnhance` helper stores the previous value and exposes `pop(): string | undefined` with bounded depth (≥5 levels)
- [ ] The chat composer Improve/Analyze buttons continue to work without modification (no regression)
- [ ] Each free-text surface listed in Context can be enhanced via the same action (wire one as a pilot, document the pattern for the rest)
- [ ] Enhanced text replaces the surface value non-destructively; user can undo the last enhancement
