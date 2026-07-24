# Immediate Plan — Backend/Frontend Reconciliation Gaps

> **Temporary document** — compiled for current issues only.
> Not a permanent spec. Generated: 2026-07-24.
>
> **Post-reconciliation state** — all deferred items from the 6 branch merges
> (mood-frontend, assistant-gm-schema, admin-portal, llm-sd-injection,
> nsfw-features, emotional-avatar) have been resolved.
> This document now tracks the next improvement cycle.

---

## Current State

All 6 merged branches are reconciled:

| Branch                | Commit    | Status               |
| --------------------- | --------- | -------------------- |
| `mood-frontend`       | `4e8d5d8` | ✅ Clean             |
| `assistant-gm-schema` | `02c9038` | ✅ Clean             |
| `admin-portal`        | `74e8386` | ✅ Clean             |
| `llm-sd-injection`    | `361f799` | ✅ Resolved conflict |
| `nsfw-features`       | `bb0b319` | ✅ Clean             |
| `emotional-avatar`    | `37508ba` | ✅ Resolved conflict |

Deferred DB/schema fixes applied:

- Migration `027_template_injection` — added `down()` function
- `template_overrides` column synced into `schema-manifest.ts`
- `character_arousal` table confirmed present in NSFW migration + manifest

---

## Next Improvement Cycle

### 1. Fast Review & Hook System

Hooks using main/aux LLM on content for triggering events (mood, emotions, NSFW, moderation). All hooks respect privacy and NSFW allowance.

**Infrastructure created** (`src/generation/hooks/`):

- `types.ts` — `HookHandler`, `HookContext`, `HookResult`, `HookChainOptions`
- `mood-hook.ts` — detects mood shifts in content, emits mood delta events
- `emotion-hook.ts` — detects emotional content, triggers avatar selection
- `nsfw-hook.ts` — checks content against `nsfw_policy` and `NsfwConfig`
- `moderation-hook.ts` — flags content for review, applies moderation actions
- `registry.ts` — hook registry and chain runner (`runHookChain`, `initDefaultHooks`)
- `index.ts` — barrel export

**Wired into pipeline** (`src/generation/auto-gen.ts`):

- `runHookChain()` called after LLM content generation, before storage
- Blocks content if NSFW gating or moderation flags suppress it

**Next steps:**

- [ ] Wire hooks into `PromptAssembler` for pre-generation content analysis
- [ ] Add hook configuration to `Config` schema (`enableMoodHooks`, `enableModerationHooks`)
- [ ] Add `nsfwPolicy` fetching from actor data in `triggerAutoGeneration`
- [ ] Add `eventTypes` field to `HookContext` for targeted hook routing

### 2. Test Coverage for FExBExDB Harmonization

**Next steps:**

- [ ] Migration up/down roundtrip tests for all migrations
- [ ] Schema manifest ↔ DB column parity validation test
- [ ] Service-layer integration tests with test DB (`createTestDb`)
- [ ] Route handler validation tests for admin, NSFW, mood endpoints
- [ ] Hook chain integration tests
- [ ] End-to-end: character creation → mood → emotion → NSFW policy

### 3. Low-Hanging Fruit

- [ ] Resolve pre-existing ESLint errors in merged branches (37 errors across 224 files)
  - `src/routes/nsfw.ts` — 3 unnecessary type assertions
  - `src/rpg/body-systems/` — deprecated `exec`, `setClause` naming, type annotations
  - `src/rpg/intimacy/` — deprecated `exec`
  - `src/rpg/seduction/` — `setClause` naming, type annotations
  - `src/tui/nsfw-filter.ts` — missing switch-case braces
- [ ] Add request ID correlation for FExBExDB traceability
- [ ] Add generation pipeline debug tracing
- [ ] Add `frontend.mode` config + Accept-based content negotiation
- [ ] Tighten frontend `tsconfig.frontend.json` to match backend strictness

### 4. Epic Reconciliation & Structuring

**Next steps:**

- [ ] Update `.plan/epics.md` with current state of all active epics
- [ ] Structure epics for future dev separation (per-feature epic files)
- [ ] Close confirmed-feature tickets that are now merged
- [ ] Create new tickets for the hook system implementation
- [ ] Create tickets for test coverage improvements

### 5. Worktree Support for `stg`/`dev`

Already applied: `stg` and `dev` added to `PROTECTED_BRANCHES` in `scripts/worktree.sh`.
Both branches already exist in the repo.

**Next steps:**

- [ ] Create `stg` worktree for pre-merge validation
- [ ] Create `dev` worktree for feature development with fewer restrictions
- [ ] Document worktree workflow for `stg`/`dev` in AGENTS.md

---

## Summary of Findings

| Feature                | Backend      | Frontend     | Route | Status                   |
| ---------------------- | ------------ | ------------ | ----- | ------------------------ |
| Chat                   | ✅           | ✅           | ✅    | Complete                 |
| Group Chat             | ✅           | ✅           | ✅    | Complete                 |
| Character Setup        | ✅           | ✅           | ✅    | Complete                 |
| Assistant              | ✅ (MVP)     | ✅           | ✅    | Complete                 |
| Impersonation          | ✅           | ✅           | ✅    | Complete                 |
| Mood                   | ✅           | ❌           | ✅    | Frontend missing         |
| Context Window Sliding | ✅           | ✅           | ✅    | Complete                 |
| Emotional Avatar       | ✅ (service) | ❌           | ❌    | Route + frontend missing |
| NSFW Features          | ⚠️ (config)   | ❌           | ❌    | Frontend missing         |
| Assistant/GM           | ⚠️ (raw JSON) | ⚠️ (raw JSON) | ⚠️     | Typed schema missing     |
| Encryption/Compression | ✅           | ✅           | ✅    | Complete                 |
| Hook System            | 🆕           | —            | —     | Infrastructure created   |

---

## Finalization Items

### Required Before "Done"

1. **Run `bun run check`** — typecheck + lint + format + md:lint
2. **Run `bun test src/`** — unit tests
3. **Run `E2E_SAFEGUARD=1 bun test tests/e2e/`** — e2e tests (if affected)
4. **Commit with `agent-commit`** — if changes are made from this plan
5. **Update `.plan/epics.md`** — if new epics are created from this plan

### Optional Enhancements (Lower Priority)

- [ ] Add request ID correlation for FExBExDB traceability
- [ ] Add generation pipeline debug tracing
- [ ] Add `frontend.mode` config + Accept-based content negotiation
- [ ] Tighten frontend `tsconfig.frontend.json` to match backend strictness
- [ ] Add `eslint-plugin-import` (no-cycle, order) + `no-misused-promises` to frontend

---

## Related Epics

| Epic                        | File                                                    | Relevance                             |
| --------------------------- | ------------------------------------------------------- | ------------------------------------- |
| Character Core System       | `.plan/epics/epic-character-core-system.md`             | Mood, emotional avatar, NSFW features |
| ComfyUI Plugin              | `.plan/epics/epic-comfyui-plugin.md`                    | SD/ComfyUI integration                |
| Chat Lifecycle & Moderation | `.plan/epics/epic-chat-lifecycle-moderation.md`         | GM config, visual novel               |
| Assistant GM Flows          | `.plan/epics/epic-assistant-gm-flows.md`                | GM role, assistant integration        |
| Tooling Improvement         | `.plan/epics/epic-tooling-improvement.md`               | Admin portal, template mgmt           |
| Observability & Telemetry   | `.plan/epics/epic-observability-telemetry.md`           | Admin dashboard                       |
| Encryption Foundation       | `.plan/epics/epic-encryption-foundation-aes-256-gcm.md` | Key management UI                     |
| Configuration Extensions    | `.plan/epics/epic-config-extensions.md`                 | LLM/SD config                         |

--- tip: run 'lean-ctx setup' to configure agent rules for optimal AI integration ---
