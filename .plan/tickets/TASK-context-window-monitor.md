<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Context Window Monitor

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Low–Med
**Epic:** Epic 36 (Chat Lifecycle)
**Tags:** chat, context, tokens, ux, monitor
**Source:** FEAT-069 (git issue)

## Summary

Display a real-time context window usage indicator in the chat UI. Shows
how many tokens remain before the context is full, with visual warnings
at thresholds. Helps users understand when context pruning will occur
and manage long conversations.

## Rationale

- Users don't know when context will be trimmed — surprises break immersion
- Token awareness helps users decide when to start a new chat or use /context
- Related to FEAT-072 (Smart Context Pruning) — monitor shows what pruning affects
- Low effort, high daily-use value for power users

## Current State

- No context window size tracking in frontend
- Token counts computed server-side during generation but not exposed
- No visual indicator of context fullness
- Users discover context limits only when older messages disappear

## Architecture

### Data Flow

```
Server: token count computed during generation
  ↓
API response includes: { context_used: number, context_max: number }
  ↓
Frontend: Alpine.js state tracks context_used / context_max
  ↓
UI: progress bar + percentage in chat header or input area
```

### Threshold States

| Usage     | State    | Visual                                  |
| --------- | -------- | --------------------------------------- |
| 0–60%     | Healthy  | Green bar, no label                     |
| 60–80%    | Warning  | Yellow bar, "Context filling" tooltip   |
| 80–95%    | Critical | Orange bar, "Context nearly full" label |
| 95–100%   | Imminent | Red bar, "Context will be trimmed soon" |
| Post-trim | Reset    | Bar drops back to green after pruning   |

### API Changes

```typescript
// Add to message create/generate response
interface GenerateResponse {
  // ... existing fields
  context: {
    used_tokens: number;
    max_tokens: number;
    percentage: number;
    will_trim: boolean;
  };
}
```

### UI Component

```
Chat header or input area footer:
┌─────────────────────────────────────────────┐
│ [input area]                    [Ctx: 42%] │
│                              ████████░░░░░░ │
└─────────────────────────────────────────────┘
```

## Tasks

### Phase 1: Backend Token Counting

- [x] Add context size tracking to generation response
- [x] Include `context` object in `POST /api/chats/:id/messages` response
- [x] Add context size to `GET /api/chats/:id/context` response (with threshold field)
- [x] Token counting uses same estimator as generation pipeline

### Phase 2: Frontend State

- [x] Add Alpine.js context state: `contextWindow()` component
- [x] Update on chat load/switch via `$watch`
- [x] Compute threshold state (healthy/warning/critical/imminent)

### Phase 3: UI Component

- [x] Create context monitor component (progress bar + percentage)
- [x] Position in chat header (inline, after action buttons)
- [x] Color transitions based on threshold (green/yellow/orange/red)
- [x] Tooltip with detailed info on hover (formattedTokens + statusText)
- [ ] Respect `prefers-reduced-motion` for bar animation

### Phase 4: Settings & Preferences

- [ ] Add setting: show/hide context monitor
- [ ] Add setting: threshold values (customizable)
- [ ] Persist in user settings

## Files to Create

- `src/frontend/alpine/context-monitor.ts` — context state + threshold logic
- `src/views/context-monitor.html` — progress bar component

## Files to Modify

- `src/routes/messages.ts` — add context info to generate response
- `src/routes/chats.ts` — add context info to chat GET
- `src/views/chat.html` — mount context monitor component
- `src/public/css/app.css` — progress bar styles

## Implementation Evidence

- `src/chat/context-window.ts` — `computeContextStats` function added
- `src/chat/index.ts` — `computeContextStats` and `ContextStats` type exported
- `src/routes/messages/create.ts` — context stats included in 201 response
- `src/chat/token-counter.ts` — token estimation using same heuristic as generation pipeline

## Acceptance Criteria

- [ ] Context monitor shows accurate token usage percentage
- [ ] Color transitions at defined thresholds
- [ ] Updates after each message exchange
- [ ] Tooltip shows used/max tokens on hover
- [ ] Setting to hide monitor exists
- [ ] No performance impact on message rendering

## Risk

Low — read-only display of existing token count data. No schema changes.
Main risk is token estimation accuracy (must match generation pipeline).
