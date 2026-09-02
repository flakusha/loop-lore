<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Access Quota Engine

**Status:** 📝 Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, quota, enforcement, rationing
**Related:** `epic-assistant-entity-access.md`, `epic-resource-provision.md`

## Summary

Implement quota enforcement for assistant entity-access operations. RAG searches, asset operations, and adaptation calls consume quota; enforcement happens pre-call with `QuotaExceededError`.

## Motivation

RAG searches, asset preview generation, and adaptation LLM calls are expensive operations. Without quota enforcement, a user could exhaust resources with unbounded queries. Quota enforcement prevents this by blocking operations when the user's quota is exceeded.

## Design

### Quota Model

Each operation type consumes quota units:

| Operation | Cost (quota units) |
|---|---|
| `/rag-search` | 1 unit per search |
| `/rag-ask` | 3 units per query (LLM call) |
| `/asset-search` | 1 unit per search |
| `/asset-preview` | 0.5 units per preview |
| `/adapt` | 5 units per adaptation |
| `/modify` | 3 units per modification |
| `/duplicate` | 1 unit per duplication |
| `/import` | 2 units per import |

### Pre-Call Enforcement

Quota is checked **before** any operation executes:

```ts
async function enforceQuota(userId: string, cost: number): Promise<void> {
  const remaining = await getRemainingQuota(userId);
  if (remaining < cost) {
    throw new QuotaExceededError(
      `Quota exceeded. Need ${cost} units, have ${remaining}.`,
      { needed: cost, available: remaining },
    );
  }
  // Deduct quota atomically
  await deductQuota(userId, cost);
}
```

### `QuotaExceededError`

Distinct from provider 429 errors — this is a user-level quota limit, not a rate limit from an external provider:

```ts
class QuotaExceededError extends Error {
  constructor(
    message: string,
    public details: { needed: number; available: number },
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}
```

### Quota Storage

Quota is tracked per user in the `quota` table (or `actor_quota` if per-character). Columns: `user_id`, `total_quota`, `used_quota`, `reset_at`. Quota resets on a configurable schedule (daily/weekly).

### Integration with Resource Provision

Quota draws from the resource provision model (`epic-resource-provision.md`): users provision computing power/keys for external inference/storage; quota enforcement applies to assistant operations that consume those resources.

## Tasks

- [ ] Define quota model (operation costs per type)
- [ ] Implement `enforceQuota` function with `QuotaExceededError`
- [ ] Implement quota storage (per-user tracking)
- [ ] Integrate quota checks into RAG, asset, and adaptation command handlers
- [ ] Implement quota deduction and reset
- [ ] Unit tests for quota enforcement

## Acceptance Criteria

- [ ] Each operation type has a defined quota cost
- [ ] `enforceQuota` blocks operations when quota is exceeded
- [ ] `QuotaExceededError` provides needed/available details
- [ ] Quota is deducted atomically before operation execution
- [ ] Quota resets on configured schedule
- [ ] Quota checks compose with existing access guards
- [ ] Unit tests pass

## Files

- `src/assistant/quota/engine.ts` — Quota enforcement engine
- `src/assistant/quota/errors.ts` — `QuotaExceededError`
- `src/assistant/quota/storage.ts` — Per-user quota tracking

## Dependencies

- `epic-resource-provision.md` — Resource provisioning model
- `src/crypto/byok.ts` — Key wrapping (for quota-secured external inference)
