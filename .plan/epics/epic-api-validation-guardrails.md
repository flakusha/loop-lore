<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: API Validation & Guardrails

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** validation, typebox, sanitization, prompt-injection, guardrails
**Parent Epic:** API Governance (epic-api-governance.md)

## Summary

TypeBox-based request validation (body, query, path, header) with formatted
validation errors, plus AI guardrails: input sanitization, prompt-injection
detection, content filtering, output validation, safety scoring, and a
guardrails dashboard. This is the largest governance slice and the gate every
other sub-epic sits behind.

## Sub-Epic of

Part of the **API Governance** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- Request Validation (Phase 2 of the parent epic)
- AI Guardrails (Phase 3 of the parent epic)

## Design

### TypeBox Schemas

```typescript
import { Type, } from "@sinclair/typebox";

// Request schemas
export const ChatRequestSchema = Type.Object({
  model: Type.String(),
  messages: Type.Array(Type.Object({
    role: Type.Union([
      Type.Literal("system",),
      Type.Literal("user",),
      Type.Literal("assistant",),
    ],),
    content: Type.String(),
  },),),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2, },),),
  maxTokens: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, },),),
},);

// Response schemas
export const ChatResponseSchema = Type.Object({
  id: Type.String(),
  content: Type.String(),
  model: Type.String(),
  usage: Type.Object({
    promptTokens: Type.Number(),
    completionTokens: Type.Number(),
    totalTokens: Type.Number(),
  },),
},);
```

### Validation Middleware

```typescript
import { validate, } from "./validation/validator";

// Apply validation to route
app.post("/api/chat", {
  schema: {
    body: ChatRequestSchema,
    response: ChatResponseSchema,
  },
  beforeHandle: [validate,],
}, async (c,) => {
  const body = c.body; // Fully validated and typed
  // ...
},);
```

### AI Guardrails

```typescript
import { guardrails, } from "./validation/guardrails";

// Apply guardrails to LLM inputs
const sanitized = await guardrails.sanitize(userInput,);
const safe = await guardrails.checkSafety(sanitized,);

if (!safe) {
  return { error: "Input rejected by safety guardrails", };
}
```

## Tasks

### Request Validation

- [ ] Implement TypeBox schema definitions
- [ ] Add request body validation
- [ ] Create query parameter validation
- [ ] Add path parameter validation
- [ ] Implement header validation
- [ ] Build validation error formatting

### AI Guardrails

- [ ] Implement input sanitization
- [ ] Add prompt injection detection
- [ ] Create content filtering
- [ ] Implement output validation
- [ ] Add safety scoring
- [ ] Build guardrails dashboard

## Dependencies

- Parent hub: **API Governance** (`epic-api-governance.md`) — owns the shared layout and governance REST endpoints.
- Siblings: builds on `epic-api-openapi.md` (generated spec ↔ schema alignment). Once landed, unblocks `epic-api-rate-limiting.md`, `epic-api-telemetry.md`, and `epic-api-task-offloading.md`, which are mutually independent after this slice.

## Files

- `src/api-governance/validation/schema.ts` — Schema definitions
- `src/api-governance/validation/validator.ts` — Request validator
- `src/api-governance/validation/sanitizer.ts` — Input sanitizer
- `src/api-governance/validation/guardrails.ts` — AI guardrails

## Notes

- TypeBox provides runtime validation with static type inference
- Guardrails protect against prompt injection before inputs reach LLM providers
