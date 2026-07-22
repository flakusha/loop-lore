# TASK: Response Length Control (FEAT-071)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** Epic 51 (Response Controls)
**Tags:** chat, generation, ux
**Git Issue:** FEAT-071

## Summary

Preset response length control — Short, Medium, Long, and Custom. Users can set a default length that influences how the assistant generates responses.

## Rationale

- Users have different preferences for response verbosity
- Some contexts need concise answers, others need detail
- Custom presets allow fine-grained control
- Persistent setting avoids repeated configuration

## Current State

- No response length control
- Model generates at its default length
- No user preference for verbosity

## Architecture

### Length Presets

| Preset | Description                   | Token Range |
| ------ | ----------------------------- | ----------- |
| Short  | Brief, to-the-point responses | 50–150      |
| Medium | Balanced detail (default)     | 150–400     |
| Long   | Detailed, thorough responses  | 400–1000    |
| Custom | User-defined token range      | User set    |

### Implementation

```typescript
interface ResponseLengthConfig {
  preset: "short" | "medium" | "long" | "custom";
  customMin?: number;
  customMax?: number;
  maxTokens: number; // computed from preset
}
```

### UI

- Dropdown in chat settings or input area
- Shows preset names with token ranges
- Custom option opens a slider or input fields
- Persists as user preference

### Backend Integration

- `max_tokens` parameter passed to LLM provider
- Can be overridden per-chat via chat settings
- World configs can set default response length

## Tasks

- [ ] Add response length config to user settings
- [ ] Add length preset dropdown to chat UI
- [ ] Wire `max_tokens` to generation request
- [ ] Add custom preset UI (min/max inputs)
- [ ] Write tests for length config validation

## Risk

Low — simple parameter passing to existing generation flow.

## Files

- `src/routes/settings.ts` — add response length config
- `src/frontend/components/response-length-control.html` — UI dropdown
- `src/frontend/alpine/settings.ts` — length state
- `src/generation/generate-route.ts` — pass max_tokens from config
