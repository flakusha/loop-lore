# TASK: Quick-Regen Button

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** Epic 51 (Output Control & Transforms)
**Tags:** chat, regen, ux, llm
**Source:** FEAT-070 (git issue)
**Related:** FEAT-message-swipe-replay-branch, docs/spec/messages.md

## Summary

One-click regeneration of the last assistant/character response. User
clicks a regenerate button on the most recent AI message, the message
is removed and a new generation request is sent with the same context.
Supports regenerating with different parameters (temperature, model).

## Rationale

- Users often want to retry a response that didn't fit their vision
- Currently requires manually deleting the message and re-sending
- SillyTavern and other chat apps have this — users expect it
- Low effort, high daily-use value

## Current State

- No regenerate endpoint exists
- Message deletion exists (`DELETE /api/messages/:id`)
- Generation pipeline exists (`triggerAutoGeneration` in `src/generation/auto-gen.ts`)
- No UI button for regeneration

## Architecture

### Regeneration Flow

```
User clicks ↻ on last AI message
  ↓
Confirm dialog: "Regenerate this response?"
  ↓ (confirm)
DELETE /api/messages/:id (soft-delete, archived)
  ↓
POST /api/chats/:id/messages with same context
  ↓
New response replaces deleted one
```

### API Endpoint

```typescript
// Regenerate last response in a chat
POST /api/chats/:id/regenerate
Body: {
  message_id: string;           // ID of message to regenerate
  overrides?: {
    temperature?: number;       // Override generation temperature
    max_tokens?: number;        // Override response length
    model?: string;             // Override model
  };
}
Response: {
  message: Message;             // New generated message
  original_id: string;          // ID of the archived original
}
```

### Constraints

- Only the last AI message can be regenerated (or a specific message_id)
- Only the message author or chat owner can regenerate
- If chat has been modified since the message, warn user
- Regeneration archives (not hard-deletes) the original

### UI Component

```
Message bubble (AI response):
┌─────────────────────────────────────┐
│ Character name              12:34   │
│ Response text here...              │
│                          [↻] [⋯]   │
└─────────────────────────────────────┘
  ↻ = regenerate (only on last AI message)
  ⋯ = context menu (existing)
```

## Tasks

### Phase 1: Backend

- [ ] Create regenerate endpoint: `POST /api/chats/:id/regenerate`
- [ ] Implement message archival (reuse existing archive logic)
- [ ] Implement context re-assembly from retained messages
- [ ] Support temperature/max_tokens/model overrides
- [ ] Permission checks (author or owner only)
- [ ] Idempotency: prevent concurrent regenerations

### Phase 2: Frontend

- [ ] Add regenerate button to last AI message bubble
- [ ] Confirm dialog before regeneration
- [ ] Loading state during regeneration
- [ ] Error handling (generation failed, context empty)
- [ ] Button disappears when not last AI message

### Phase 3: Settings

- [ ] Add regenerate to chat settings (enable/disable)
- [ ] Default model/temperature for regeneration (can differ from chat)
- [ ] Persist regenerate-specific overrides per-chat

## Files to Create

- `src/routes/chat-regenerate.ts` — regenerate endpoint

## Files to Modify

- `src/routes/router.ts` — register regenerate route
- `src/views/chat.html` — regenerate button on last AI message
- `src/frontend/alpine/chat.ts` — regenerate state + confirm dialog
- `src/public/css/app.css` — regenerate button styles

## Acceptance Criteria

- [ ] Regenerate button appears only on last AI message
- [ ] Click archives original and generates new response
- [ ] Override parameters (temperature, model) work
- [ ] Permission check prevents unauthorized regeneration
- [ ] Concurrent regeneration attempts are blocked
- [ ] Archived original is restorable
- [ ] No duplicate messages after regeneration

## Risk

Low — reuses existing generation pipeline and message archival.
Main risk is context re-assembly accuracy (must match original context).
