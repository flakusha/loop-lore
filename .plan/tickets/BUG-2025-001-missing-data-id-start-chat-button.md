# BUG-2025-001: Missing `data-id` on character detail "Start Chat" button

**Status**: open
**Priority**: high
**Labels**: e2e-blocking, characters, ux
**Assignee**:
**Epic**: (if applicable)
**Related**: characters-flow E2E test "start chat button in detail modal redirects to chat"

### Description

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
