<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin / Moderator Frontend for Assistant Tooling Allowlist + Capability Levels

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task (admin + moderator UI)
**Tags:** admin, moderator, assistant, tooling, allowlist, capability-levels, frontend
**Epic:** epic-byok-local-models.md (admin model surface extension) + epic-assistant-gm-flows.md (tooling)

## Summary

Ship a dedicated admin frontend for configuring the **assistant tooling allowlist** and **capability levels** (which `CapabilityTag` set each `ModelRole` may resolve to), plus a moderator-facing read-only roll-up of denials, sandbox metrics, and recent audit entries. This extends `src/admin/model-roles.ts` (currently `VALID_ROLES = [Main, Auxiliary, Captioning]`) to cover `Embeddings / Summarization / Moderation / Extraction / Analysis` and gives operators a UI to set per-instance allowlists.

## Why this task exists (the gap)

The user explicitly asked: "admin/moderator frontend for assistant capabilities levels and allowed tooling". Current state:

- `src/admin/model-roles.ts:20` — `VALID_ROLES = [Main, Auxiliary, Captioning]`. `Embeddings`, `Summarization`, `Moderation` are in the enum (`src/db/enums-core/flags.ts:69`) but **not admin-pickable**.
- No admin UI for per-tool capability tags (`TASK-assistant-tool-injection-guard.md`'s `ToolCapability.tags`).
- No admin UI for per-user capability allowlists (`perUserAllow`).
- No moderator read-only view of `tool_call_audit` (denials, sandbox kills, review-needed).

## Design

### Admin page — `/admin/assistant/tooling`

Three tabs (HTMX partials):

1. **Model Roles** — extends existing `model-roles.ts`. New rows for `Embeddings / Summarization / Moderation / Extraction / Analysis` with provider + model pickers + per-role tuning. Mirrors `VALID_ROLES` extension from `epic-rag-assets-unified-storage-and-assistant-flows.md` B-R3.
2. **Tool Capability Matrix** — table of all 36 commands with capability tags (multi-select per `CapabilityTag`) + per-tool resource limits (timeoutMs, memoryMb, networkBytes) + per-tool `allowedNetworkHosts` (string list) + `allowedFsPaths`. Save commits via `PATCH /api/admin/assistant/tools/:tool`.
3. **Per-User Allowlists** — list of users with custom capability overrides (e.g. trusted power-user can invoke `destructive` for own rows). Add/remove via `PATCH /api/admin/assistant/users/:userId/allowlist`.

### Moderator page — `/moderator/assistant/tooling` (read-only)

Tabs:

1. **Recent Denials** — last 100 `tool_call_audit` rows where `verdict='denied'`, grouped by tool.
2. **Sandbox Metrics** — average `timeoutMs`, `memoryMb`, network bytes consumed, kill rate, by tool. Sparkline per tool.
3. **Review Queue** — entries where Layer 2 (aux-llm judge) was invoked; surface confidence + rationale.
4. **Per-User Activity** — denials + reviews grouped by user, sortable.

### API

```ts
// src/routes/admin/assistant-tooling.ts
GET    /api/admin/assistant/tools            // list tool capabilities
PATCH  /api/admin/assistant/tools/:tool      // update capabilities + limits
GET    /api/admin/assistant/users/:userId/allowlist
PATCH  /api/admin/assistant/users/:userId/allowlist

// src/routes/moderator/assistant-tooling.ts
GET    /api/moderator/assistant/audit        // paginated audit log
GET    /api/moderator/assistant/metrics      // sandbox metrics rollup
```

All admin endpoints require `admin.*` capability (existing guard); moderator endpoints require `moderation.*` capability (existing guard).

## Files

- `src/admin/model-roles.ts` — extend `VALID_ROLES` to include `Embeddings / Summarization / Moderation / Extraction / Analysis`
- `src/db/migrations/parts/NNN_admin_assistant_tooling.ts` — `tool_capabilities` + `user_tool_allowlists` tables (append-only)
- `src/db/enums-core/flags.ts` — add `Extraction`, `Analysis` to `ModelRole` (additive)
- `src/routes/admin/assistant-tooling.ts` — admin endpoints
- `src/routes/moderator/assistant-tooling.ts` — moderator endpoints
- `src/frontend/pages/admin-assistant-tooling.ts` — admin page (3 tabs)
- `src/frontend/pages/moderator-assistant-tooling.ts` — moderator page (4 tabs)
- `src/partials/admin/tool-capability-row.html` — per-tool row partial
- `src/partials/moderator/audit-row.html` — audit row partial
- `src/validation/schemas.ts` — `ToolCapabilityUpdate`, `UserAllowlistUpdate` schemas
- `src/elysia-app.ts` — register new route plugins

## Acceptance Criteria

- [ ] `VALID_ROLES` extended; `Embeddings / Summarization / Moderation / Extraction / Analysis` admin-pickable
- [ ] Admin can edit per-tool capability tags, resource limits, network/FS allowlists
- [ ] Admin can edit per-user capability allowlists
- [ ] Admin UI follows design tokens; HTMX partials; Alpine stores
- [ ] Moderator can view recent denials + sandbox metrics + review queue + per-user activity
- [ ] Moderator UI is read-only (no PATCH endpoints exposed)
- [ ] All admin/mod endpoints go through existing `admin.*` / `moderation.*` guards
- [ ] No capability can be elevated above the global `CAPABILITY_POLICY` ceiling
- [ ] Schema migration is additive; no existing tables altered
- [ ] All existing admin tests still pass

## Dependencies

- Builds on: `TASK-assistant-tool-injection-guard.md` (capability matrix + `tool_call_audit`)
- Builds on: `src/admin/model-roles.ts` (existing pattern)
- Bridges: `epic-byok-local-models.md` (model surface extension) and `epic-rag-assets-unified-storage-and-assistant-flows.md` B-R3 (ModelRole enum extension)
- Schema strategy: **append new migration part** (never alter `016_fts`; same policy for `model_role_overrides` etc.).
