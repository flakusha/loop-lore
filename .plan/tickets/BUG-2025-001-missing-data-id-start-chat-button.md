<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG-2025-001: Missing `data-id` on character detail "Start Chat" button

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status**: closed
**Priority**: high
**Labels**: e2e-blocking, characters, ux
**Assignee**:
**Epic**: (if applicable)
**Related**: characters-flow E2E test "start chat button in detail modal redirects to chat"

## Description

The "Start Chat" button in the character detail modal (`src/partials/characters/detail-modal.html`) does not have a `data-id` attribute with the character's ID. This causes `startChatFromChar()` in `src/frontend/pages/characters.ts` to return early without creating a chat.

The button HTML:

```html
<button
  class="btn btn-secondary"
  data-action="start-chat"
  x-on:click="window.startChatFromChar($el)"
  data-testid="start-chat-btn"
</button>
```

But `startChatFromChar()` checks `btn.dataset.id`:

```typescript
globalThis.startChatFromChar = async function(btn: HTMLElement) {
  const id = btn.dataset.id;
  if (!id) { return; }  // ← Returns here because data-id is missing
```

### Acceptance Criteria

- [ ] Add `data-id` attribute to the start-chat button in `src/partials/characters/detail-modal.html`
- [ ] The button should receive the character ID from the modal's Alpine data context
- [ ] `startChatFromChar()` successfully creates a chat and redirects to `/views/chat?chatid=...`
- [ ] characters-flow E2E test "start chat button in detail modal redirects to chat" passes

### Notes

- The modal template needs to pass the character ID to the button. Check how the modal is opened and what Alpine data is available.
- The `x-on:click` handler already references `$el`, so the ID could be set dynamically via `:data-id="currentCharacter.id"` or similar.

## Resolution (stale — resolved by populateModal)

Verified 2026-08-23 during frontend template audit. `src/frontend/pages/characters.ts`
`populateModal()` (lines 56-58) injects the character id onto the buttons at
modal-population time:

  modal.querySelector("[data-action='start-chat']")?.setAttribute("data-id", id);
  modal.querySelector("[data-action='edit-char']")?.setAttribute("data-id", id);
  modal.querySelector("[data-action='delete-char']")?.setAttribute("data-id", id);

So `startChatFromChar()` receives `btn.dataset.id` correctly; the static template
lacking `data-id` is by design (filled dynamically). No code change needed. Closing
as stale-resolved. See also BUG-character-export-broken-export-modal-missing-data-character-id
for a genuine `data-character-id` gap on the export modal.

### Re-verification (2026-09-18, dev HEAD a3e6478c2)

Characters-flow E2E (`tests/e2e/flows/browser/characters-flow.browser.ts`) previously
could not run because the dev server failed to bootstrap with a memoirist route
collision (`/api/chats/:chatId/story/state` vs `/api/chats/:id/story-turns`). That
collision was fixed by commit a3e6478c2 (rename `:chatId` → `:id` in
`src/routes/story-orchestration/index.ts`). After the fix the server boots and
the `data-id` wiring in `populateModal` is exercised in the live flow. The
characters-flow E2E still fails, but on an unrelated `ReferenceError: process
is not defined` browser-side bundle issue — not this ticket's `data-id` concern.
`populateModal` wiring remains correct as-shipped.
