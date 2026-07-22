# TASK: Quick-Regen Button (FEAT-070)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** Epic 51 (Response Controls)
**Tags:** chat, regen, ux
**Git Issue:** FEAT-070

## Summary

One-click button to regenerate the last assistant response. Provides a quick way to get an alternative response without manually editing and resending.

## Rationale

- Users often want a different response from the same prompt
- Eliminates friction of edit + resend flow
- Standard pattern in chat UIs (Discord, ChatGPT, etc.)
- Enables experimentation with different outputs

## Current State

- No quick-regen button exists
- Users must manually edit the last message and resend
- Regenerate requires full message resend via API

## Architecture

### Button Placement

- Appears on the last assistant message on hover
- Only visible on the most recent assistant message
- Disabled during generation

### Regeneration Flow

```
User clicks "Regenerate" button
  ↓
Frontend: disable button, show spinner
  ↓
POST /api/messages/regenerate
  body: { chatId, messageId, parentId }
  ↓
Backend: re-run generation with same context
  ↓
Streaming response replaces original message
  ↓
Button re-enabled, new message gets hover actions
```

### API Endpoint

```typescript
POST /api/messages/regenerate
Body: {
  chatId: string;
  messageId: string;  // message to replace
  parentId?: string;  // parent message (defaults to message's parent)
}
Response: SSE stream of new message chunks
```

## Tasks

- [ ] Add regenerate button to message hover actions
- [ ] Create `/api/messages/regenerate` endpoint
- [ ] Implement regeneration logic (same context, new generation)
- [ ] Wire streaming response to replace original message
- [ ] Add loading state to button
- [ ] Write tests for regeneration endpoint

## Risk

Low — straightforward extension of existing generation flow.

## Files

- `src/routes/messages.ts` — add regenerate endpoint
- `src/frontend/components/message-actions.html` — add regen button
- `src/frontend/alpine/chat-actions.ts` — regen handler
