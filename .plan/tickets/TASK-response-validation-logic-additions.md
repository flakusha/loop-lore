<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Response Validation Logic Additions

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Add validation logic for responses across the system — LLM generation outputs, API response shapes, and RPG calculation results. Ensures responses meet expected schemas, constraints, and quality thresholds before returning to callers.

## Scope

### 1. LLM Response Validation

Validate LLM generation outputs before returning to the caller:

| Check                    | Description                                        | Failure Mode                |
| ------------------------ | -------------------------------------------------- | --------------------------- |
| **Schema compliance**    | Response matches expected JSON structure           | Parse error, retry          |
| **Length bounds**        | Response within min/max token limits               | Truncate or regenerate      |
| **Content safety**       | Response passes NSFW/moderation filters            | Block, regenerate, or flag  |
| **Repetition detection** | Response doesn't repeat phrases/paragraphs         | Regenerate with penalty     |
| **Hallucination guards** | Response doesn't fabricate entities not in context | Log warning, optional retry |

### 2. API Response Validation

Ensure API responses conform to declared schemas:

| Check                 | Description                                            | Where              |
| --------------------- | ------------------------------------------------------ | ------------------ |
| **Schema validation** | Response matches `response:` declaration               | Route middleware   |
| **Type safety**       | Response fields match expected types                   | Elysia `t` schemas |
| **Error envelope**    | Errors use consistent `{ error, code, details }` shape | All error paths    |
| **Pagination**        | List responses include `total`, `hasMore`, `cursor`    | List endpoints     |

### 3. RPG Calculation Validation

Validate game mechanic calculations:

| Check              | Description                        | Example                        |
| ------------------ | ---------------------------------- | ------------------------------ |
| **Stat bounds**    | Stats within valid ranges (0-999)  | STR can't be negative          |
| **Damage ranges**  | Damage within expected min/max     | No negative damage             |
| **Success rates**  | Probability values 0-100%          | No >100% success chance        |
| **Resource costs** | Mana/HP costs don't exceed current | Can't spend more than you have |

## Implementation Plan

### Phase 1: LLM Response Validators

```typescript
// src/generation/validation.ts
interface LLMResponseValidator {
  validate(response: string, context: ValidationContext,): ValidationResult;
}

interface ValidationContext {
  expectedFormat: "json" | "text" | "markdown";
  maxLength: number;
  minLength: number;
  safetyLevel: "none" | "nsfw-gate" | "strict";
  repetitionPenalty: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  sanitized?: string; // cleaned/trimmed version
}
```

### Phase 2: API Response Middleware

```typescript
// Add to Elysia route options
response: {
  200: SuccessResponse,
  400: ErrorResponse,
  401: ErrorResponse,
  404: ErrorResponse,
}
```

### Phase 3: RPG Calculation Guards

```typescript
// src/rpg/validation.ts
function validateStatBounds(stats: RPGStats,): void;
function validateDamageRange(damage: number, min: number, max: number,): void;
function validateSuccessRate(rate: number,): void;
function validateResourceCost(current: number, cost: number,): void;
```

## Files to Modify

| File                           | Change                            |
| ------------------------------ | --------------------------------- |
| `src/generation/validation.ts` | **NEW** — LLM response validators |
| `src/rpg/validation.ts`        | **NEW** — RPG calculation guards  |
| `src/generation/generate.ts`   | Add validation before return      |
| `src/routes/*.ts`              | Ensure response schemas declared  |
| `src/rpg/combat.ts`            | Add damage/stat validation        |
| `src/rpg/crafting.ts`          | Add success rate validation       |

## Acceptance Criteria

- [ ] LLM responses validated for schema, length, safety, repetition
- [ ] API responses validated against declared schemas
- [ ] RPG calculations validated for bounds and ranges
- [ ] Validation failures produce clear error messages
- [ ] Validation doesn't impact performance (>1ms per check)
- [ ] Unit tests for all validation rules
- [ ] Integration tests for validation in generation pipeline
- [ ] `bun run check` passes

## Notes

- This task adds validation LOGIC, not just schema declarations
- Complements `TASK-add-response-schemas-remaining-routes.md` (schema declarations)
- Should integrate with existing error envelope pattern
- Consider validation hooks for plugin system (future)
