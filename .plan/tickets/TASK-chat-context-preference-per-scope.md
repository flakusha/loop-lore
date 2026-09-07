<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-Scope Preferred Chat Context Window with Pre-Cap Degradation

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Task
**Tags:** context-window, chat, byok, llm-context-cap, degradation, per-world, per-chat, group-chat, admin, gm, moderator, user
**Epic:** epic-chat-context-optimization.md
- `chat.contextWindowSize` is a single per-chat integer (no per-LLM variant) — verified 2026-09-07 (`src/db/schema-core.ts:context_window: number | null`, `src/db/migrations/parts/001_core.ts:context_window: integer`)
- Per-world override: **NOT VERIFIED** — verify against `epic-chat-context-optimization.md` and `chats.world_id` lookup before claiming absent. If absent, this ticket adds the column; if present, integrate with existing scope.
- Per-group-chat override: **NOT VERIFIED** — same as above.
- No per-BYOK-LLM cap — a 7B local Ollama with 4k context and a 200k Claude model share one default
Allow admin / GM / moderator / user to set a **preferred context window** per scope (global, per-world, per-chat, per-group-chat, per-LLM-via-BYOK). The assistant + chat pipeline **degrades gracefully well before reaching the model's hard cap** — soft warnings, optional pruning strategies, and recommendation UI when default values are misaligned with the active LLM. Closes the gap where LLM-trained context (e.g. 200k for Claude, 128k for GPT-4) is hard-capped at one global setting, ignoring BYOK variance.

## Why this task exists (the gap)

`src/chat/context-window.ts` exists and `src/chat/token-counter.ts` exists, but:

- `chat.contextWindowSize` is a single per-chat integer (no per-LLM variant)
- No per-world or per-group-chat override
- No per-BYOK-LLM cap — a 7B local Ollama with 4k context and a 200k Claude model share one default
- No degradation before hitting the hard cap — the pipeline just hits the wall and truncates
- No UI to recommend changing default when BYOK LLM has different limits

## Design

### Scope precedence (3-tier + LLM override)

```ts
// src/chat/context-preference.ts
export type ContextPreferenceScope =
  | { kind: "global" }                                // admin default
  | { kind: "world"; worldId: string }                // GM/owner override
  | { kind: "chat"; chatId: string }                  // chat-owner override
  | { kind: "group-chat"; chatId: string }            // group-chat override
  | { kind: "byok-llm"; userId: string; model: string }; // per-user per-model

export interface ContextPreference {
  /** Soft target — start degrading here. */
  softCapTokens: number;
  /** Hard cap — refuse additional context past this. */
  hardCapTokens: number;
  /** Degradation strategy. */
  strategy: "truncate-oldest" | "summarize-and-trim" | "hybrid" | "reject";
  /** Where this preference is stored (recommendation engine reads). */
  source: ContextPreferenceScope;
  /** Recommendation strength: "default", "recommended", "required". */
  recommendation: "default" | "recommended" | "required";
}
```

**Precedence resolution** (highest wins):

```
byok-llm > group-chat > chat > world > global
```

Stored in:

- `chat.context_window_soft_cap` + `chat.context_window_hard_cap` (additive columns on `chats`)
- `world.context_window_default` (additive column on `worlds`)
- `context_preferences(user_id, model, soft_cap, hard_cap, strategy)` — new table for BYOK overrides
- Global default from `config.generation.defaultContextWindow`

### Pre-cap degradation

```ts
// src/chat/context-degradation.ts
export interface DegradationVerdict {
  level: "ok" | "soft-warning" | "aggressive-prune" | "hard-cap-refuse";
  /** Tokens used vs soft/hard caps. */
  usage: { used: number; softCap: number; hardCap: number };
  /** Action to take now. */
  action: "none" | "trim-summary" | "summarize-window" | "reject-request";
  /** Human-readable reason (logged, not necessarily shown to user). */
  reason: string;
}

export async function evaluateContextUsage(
  chatId: string,
  proposedTokens: number,
  db: Kysely<DB>,
  config: Config,
): Promise<DegradationVerdict>;
```

Thresholds:

- `usage < 0.6 * softCap` → `ok` (no action)
- `0.6 <= usage < 0.85 * softCap` → `soft-warning` (log; no action yet)
- `0.85 * softCap <= usage < hardCap` → `aggressive-prune` (summarize-and-trim mid-window)
- `usage >= hardCap` → `hard-cap-refuse` (reject with `ContextWindowExceededError`)

### Recommendation engine

When admin/GM/moderator sets a global default that conflicts with the active BYOK LLM, surface a non-blocking recommendation:

```
"Active LLM (claude-sonnet-4) supports 200k tokens.
 Global default is 8k. Consider raising default to 32k for better recall.
 [Apply] [Dismiss] [Apply for this chat only]"
```

Recommendation strength:

- `required` — pipeline won't run if mismatch > 50% of LLM capability (admin-set hard floor)
- `recommended` — banner shown in admin UI + chat settings; non-blocking
- `default` — no banner; mismatch logged

### Storage: admin/gm/moder/user side

Each role can set their **side** of the preference:

- **Admin** — global default + per-LLM floor (required/recommended)
- **GM** — per-world default (applies to all chats in the world)
- **Moderator** — per-group-chat override (overrides world default for that group)
- **User** — per-chat override (overrides all above for their own chat)

Stored independently; resolution happens at request time. Recommendations are surfaced to the role that owns the relevant level.

### Frontend

- `src/frontend/pages/admin-context-window.ts` — global + per-LLM config
- `src/frontend/pages/world-context-window.ts` — GM per-world config
- `src/frontend/pages/moderator-context-window.ts` — per-group-chat override
- `src/components/chat/context-window-banner.html` — recommendation banner in chat
- `src/frontend/alpine/context-window.ts` — store: `preference`, `usage`, `verdict`

## Files

- `src/chat/context-preference.ts` — `ContextPreference`, scope resolution
- `src/chat/context-degradation.ts` — `evaluateContextUsage`, `DegradationVerdict`
- `src/db/migrations/parts/NNN_context_preferences.ts` — additive `chats.context_window_soft_cap/_hard_cap`, `worlds.context_window_default`, new `context_preferences` table
- `src/chat/context-preference.test.ts` — precedence resolution tests
- `src/chat/context-degradation.test.ts` — threshold tests, all 4 levels
- `src/routes/admin/context-window.ts` — admin endpoints
- `src/routes/worlds/context-window.ts` — GM per-world endpoints
- `src/routes/moderator/context-window.ts` — moderator per-group-chat endpoints
- `src/frontend/pages/admin-context-window.ts` + `world-context-window.ts` + `moderator-context-window.ts`
- `src/frontend/alpine/context-window.ts` — recommendation banner store

## Acceptance Criteria

- [ ] `chats.context_window_soft_cap` + `_hard_cap` columns added (nullable; default = global)
- [ ] `worlds.context_window_default` column added (nullable; falls back to global)
- [ ] `context_preferences(user_id, model, ...)` table created (BYOK overrides)
- [ ] 5-tier precedence resolves: byok-llm > group-chat > chat > world > global
- [ ] 4-level degradation: ok / soft-warning / aggressive-prune / hard-cap-refuse
- [ ] Recommendations surfaced to the role owning the relevant level
- [ ] Admin UI: global default + per-LLM floor + recommendations list
- [ ] GM UI: per-world default
- [ ] Moderator UI: per-group-chat override
- [ ] User chat settings: per-chat override
- [ ] Pipeline integrates: every context-injection evaluates `evaluateContextUsage` first
- [ ] Soft warning logged with structured fields (chatId, used, softCap, level)
- [ ] Existing `src/chat/context-window.ts` and `src/chat/token-counter.ts` extended, not replaced
- [ ] All existing chat tests still pass

## Dependencies

- Builds on: `src/chat/context-window.ts`, `src/chat/token-counter.ts`, `src/config/schema.ts`
- Enables: `TASK-search-service-unified.md` (search results respect per-scope context cap)
- Bridges: `epic-byok-api-keys.md` (BYOK model metadata) + `epic-byok-local-models.md` (local model capability)
- Schema strategy: **append-only** migration; nullable columns; default values preserve current behavior
