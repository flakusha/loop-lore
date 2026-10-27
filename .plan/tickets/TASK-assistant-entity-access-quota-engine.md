<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Access Quota Engine

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Scope:** R2 epic wrap-up: rag-preview/decompose, duplicate generalization, /adapt, quota engine, tests
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, quota, enforcement, rationing
**Epic:** epic-assistant-entity-access
**Related:** `epic-assistant-entity-access.md`, `epic-resource-provision.md`
**Status Note:** Done (2026-10-27, branch `r2-entity-access-wrapup`, commit `7b45729fc`). Pre-call enforcement via `src/assistant/quota/` — `errors.ts` (`QuotaExceededError` with needed/available/operation/resetsAt details), `storage.ts` (per-user fixed-window counters, lazy reset, O(1) check-and-deduct), `engine.ts` (`enforceQuota` + `QUOTA_OPERATION_COSTS`, structured `assistant_quota_exceeded` warn event via the project logger, lazy accessor so suites without a global logger still run), `gate.ts` (`quotaGate` → `CommandResult` denial). Wired into: rag-search (2), rag-ask (6), rag-preview (2), rag-decompose (6), asset-search (2), asset-preview (1), adapt (10), modify (6), duplicate (2), import (4) — costs are the ticket table ×2 so the 0.5-unit preview stays integral.

DEVIATIONS, with reasons: (1) NO `quota` DB table — the epic mandates no schema/migration this phase, so storage is in-process per-user counters (the `federation/performance-quota.ts` cell pattern) with `configureQuotaStorage`/`configureAssistantQuota` hooks; persistence lands with a migration when cross-process quotas are required. (2) Limits are not yet read from the Config schema — module defaults (200 units / 24h window) plus the configure hooks; wiring `src/config/schema` touches the config-mirror gates and is deferred deliberately.

Evidence: `src/assistant/quota/engine.test.ts` — 8 pass / 0 fail (allow-at-exact-boundary, over-limit reject with details, per-user isolation, lazy window reset, unauthenticated refusal, admin reset, gate null-vs-denial). Wired command suites re-run green after the gate landed (rag/modify/duplicate/rag-remainder/adapt/assets/import = 97 pass / 0 fail); full scoped `bun test --isolate src/assistant/ src/rag/` = 1146 pass / 0 fail across 111 files post-commit.

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

**Resolved:** 2026-10-27 registry-driven close: git issue f5a31cb (registry tip: cd198b4ef Konstantin Fedotov Auto-closed: appended .md marker marks TASK-ASSISTANT-ENTITY-ACCESS-QUO)
