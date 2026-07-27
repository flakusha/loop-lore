# TASK: Response Length Control

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** Epic 51 (Output Control & Transforms)
**Tags:** chat, generation, ux, llm
**Source:** FEAT-071 (git issue)
**Design:** [chat-mode-reconciliation.md](../design/chat-mode-reconciliation.md) — this task is part of the three-axis chat mode design (ChatType + ChatMode + ResponseStyle)

## Summary

User-configurable response length for LLM generation. Controls max_tokens
per response, with presets (Short/Medium/Long/Custom) and per-chat overrides.
Shows estimated token count in the input area.

## Rationale

- Some chats need brief exchanges (combat, quick RP), others need detailed narration
- Without control, LLMs default to medium length — often too long for fast-paced scenes
- Per-chat override means users set it once per conversation style
- Token cost awareness: shorter responses = cheaper generation

## Current State

- `max_tokens` exists in generation config (global default)
- No per-chat or per-user override
- No UI for changing response length
- No presets

## Architecture

### Length Presets

| Preset | max_tokens | Description                      |
| ------ | ---------- | -------------------------------- |
| Short  | 150        | Quick replies, combat, reactions |
| Medium | 500        | Default, balanced                |
| Long   | 1000       | Detailed narration, descriptions |
| Custom | user-set   | Slider: 50–2000                  |

### Per-Chat Override

```typescript
// Add to chats table
interface Chat {
  // ... existing fields
  response_length_preset?: "short" | "medium" | "long" | "custom";
  response_length_custom?: number; // 50-2000, only when preset = "custom"
}
```

### Resolution Order

```
Chat-specific override (if set)
  ↓ (fallback)
User global setting (if set)
  ↓ (fallback)
Server default from config.yaml
```

### UI Component

```
Chat settings panel:
┌─────────────────────────────────────┐
│ Response Length                     │
│ [Short] [Medium●] [Long] [Custom]  │
│                                     │
│ Custom: ████████░░░ 500 tokens      │
│ (only shown when Custom selected)   │
└─────────────────────────────────────┘

Input area footer:
┌─────────────────────────────────────┐
│ [input area]           [Len: Med]   │
└─────────────────────────────────────┘
```

### API Changes

```typescript
// Add to chat settings response
interface ChatSettings {
  // ... existing fields
  response_length: {
    preset: "short" | "medium" | "long" | "custom";
    max_tokens: number; // resolved value
  };
}
```

## Tasks

### Phase 1: Schema & Backend

- [ ] Add `response_length_preset`, `response_length_custom` to chats table
- [ ] Extend `008_chat_features.ts` migration (in-place) with new columns
- [ ] Implement resolution: chat → user → server default
- [ ] Add to chat settings endpoint response
- [ ] Wire into generation pipeline (pass resolved max_tokens)

### Phase 2: Frontend Settings

- [ ] Add response length selector to chat settings panel
- [ ] Preset buttons: Short, Medium, Long, Custom
- [ ] Custom slider (50–2000 tokens)
- [ ] Persist per-chat setting
- [ ] Show current setting in input area footer

### Phase 3: Generation Integration

- [ ] Pass resolved max_tokens to generation call
- [ ] Override global config when chat-specific is set
- [ ] Token budget check (don't exceed context window)
- [ ] Log response length for analytics

## Files to Create

- `src/chat/response-length.ts` — resolution logic

## Files to Modify

- `src/db/migrations/008_chat_features.ts` — add columns (in-place extension)
- `src/routes/chats.ts` — include response_length in settings response
- `src/generation/auto-gen.ts` — pass resolved max_tokens
- `src/views/chat-settings.html` — length selector UI
- `src/frontend/alpine/chat.ts` — length state
- `src/public/css/app.css` — slider + preset button styles

## Acceptance Criteria

- [ ] Preset buttons toggle correctly
- [ ] Custom slider updates max_tokens value
- [ ] Setting persists per-chat
- [ ] Generation uses resolved max_tokens
- [ ] Fallback chain works: chat → user → server
- [ ] Token budget doesn't exceed context window
- [ ] Setting visible in input area footer
- [ ] All existing generation tests pass

## Risk

Low — simple schema addition + config resolution. No complex logic.
Main risk is token budget interaction with context window (handled by
FEAT-069/072 context monitoring).
