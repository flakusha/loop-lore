<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Public per-modality templates routes

**Status:** Done
**Status Note:** Reconciliation 2026-10-01 — flat routes exist at `/api/v1/templates` (`src/routes/templates/{crud,apply,transfer,index}.ts`, registered via `src/routes/v1/content-surface.ts:64`). These deliver CRUD, apply, export, import. Auth model (owner-only writes), apply behavior, and TypeBox schemas are consistent with this ticket's intent. Remaining gap: per-modality URL nesting (`/api/templates/:modality`) + route-level modality guards that reject unknown values (`crud.ts:59-60` currently only filters when a modality param is provided, rather than rejecting unknown values outright). Also: no explicit `is_builtin` immutability checks — future built-in rows could be writable by their owners.
**Priority:** medium
**Effort:** Small–Medium
**Summary:** Add public `/api/templates/:modality` routes that wrap the existing template service with route-level auth and modality guards, mirroring `admin-templates/` but scoped to end users.
**Context:** `/api/admin/templates` already covers admin-only CRUD across `llm`/`image`/`video`/`audio` (see `src/routes/admin-templates/`). FEAT-065 Phase 3 calls for a public per-modality surface so non-admins can manage their own templates and each modality gets a stable URL. The admin service layer (`src/generation/template-service/`) is reusable; this ticket adds route-level ownership + modality guards and a thin `apply` endpoint that returns rendered text.
**Acceptance Criteria:**

- [x] `GET/POST /api/v1/templates`, `GET/PATCH/DELETE /api/v1/templates/:id`, `POST /api/v1/templates/:id/apply` mounted and registered via `src/routes/v1/content-surface.ts`
- [x] Owner-only writes enforced (PATCH/DELETE check `owner_id !== userId`)
- [x] `apply` endpoint renders templates: image via `template-service/apply.ts:20-31`, video/audio/workflow via `template-service/apply.ts:40-50`, LLM via `PromptAssembler.assembleWithTemplateOverride()` (`src/routes/templates/apply.ts:67-84`)
- [x] Elysia `t` (TypeBox) request/response schemas defined (`crud.ts:42-43`, `apply.ts`)
- [ ] **Modality-guarded nested routes** (`/api/templates/:modality`); flat routes do not enforce modality guards or reject unknown values
- [ ] **Built-in row immutability** — flat routes lack explicit `is_builtin` checks; future built-in rows would be writable by their owners
- [ ] Tests: owner-create-then-list, non-owner PATCH/DELETE 403, built-in PATCH 405, apply with missing variables renders empty for unknown tokens
- [ ] `admin-templates/` routes unchanged; surface is additive
**Epic:** epic-config-templates (FEAT-065 umbrella)
**Refs:** `FEAT-065-template-system.md` (Phase 3), `FEAT-065-sub-video.md`, `FEAT-065-sub-audio.md`, `TASK-template-unified-variable-engine.md`, `src/routes/admin-templates/` (admin-scoped reference impl)

## Problem

`/api/admin/templates` ships and covers admin-only CRUD for all four modalities (`src/routes/admin-templates/{list,create,update,remove,index,shared}.ts`). The spec at `FEAT-065-template-system.md` calls for a **public per-modality** surface at `/api/templates/:modality` so end users (not just admins) can manage their own templates and so each modality gets a stable, discoverable URL shape.

Flat routes exist at `/api/v1/templates` (`src/routes/templates/`) but lack per-modality nesting and modality guards.

## Scope

Add `src/routes/templates/` with:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET`    | `/api/templates/:modality`           | List owner's templates for the modality (built-in rows visible to all). |
| `POST`   | `/api/templates/:modality`           | Create owned template; enforce `modality` matches URL. |
| `GET`    | `/api/templates/:modality/:id`       | Retrieve; built-in rows return to anyone, owned rows only to owner. |
| `PATCH`  | `/api/templates/:modality/:id`       | Update; owner-only; reject built-in rows. |
| `DELETE` | `/api/templates/:modality/:id`       | Delete; owner-only; reject built-in rows. |
| `POST`   | `/api/templates/:modality/:id/apply` | Render with caller-provided `ctx`; returns `{ rendered, modality }`. |

`:modality` ∈ {`llm`, `image`, `video`, `audio`}. Mount under existing auth middleware (`requireUserId`); non-`apply` reads work without auth for built-ins.

Reuse: `src/generation/template-service/{crud,apply,resolve,index}.ts`. Don't duplicate CRUD logic — wrap service calls with route-level auth and modality guards.

## Acceptance Criteria

**Acceptance Criteria:**

### Already delivered by flat routes (`/api/v1/templates`)

- [x] Routes mounted at `/api/v1/templates[/...]` via `content-surface.ts:64`
- [x] Owner-only write enforcement (PATCH/DELETE check `owner_id !== userId` in service layer)
- [x] `apply` endpoint renders templates: image via `template-service/apply.ts:20-31` (`applyImageTemplate`), video/audio/workflow via `template-service/apply.ts:40-50` (`applySimpleTemplate`), LLM via `PromptAssembler.assembleWithTemplateOverride()` returning `{messages, systemPrompt, tokenCount, tokenBudget}` (`src/routes/templates/apply.ts:67-84`)
- [x] Elysia `t` TypeBox schemas defined (IdParams at `crud.ts:42`, ListQuery at `crud.ts:43`, TemplateApplyBody at `apply.ts`)
- [x] `admin-templates/` routes unchanged; this surface is additive

### Remaining open

- [ ] Per-modality URL nesting (`/api/templates/:modality[/...]`)
- [ ] Route-level modality guards that validate AND reject unknown modality values (currently `crud.ts:59-60` only filters when a modality param is provided, not a path param)
- [ ] Explicit `is_builtin` immutability checks (flat routes have no built-in row protection; future built-in inserts would be writable by their owners)
- [ ] Tests: owner-create-then-list happy path, non-owner PATCH/DELETE 403, built-in PATCH 405
- [ ] Unknown-token behavior: `applyImageTemplate` strips unknown tokens (`apply.ts:29`); `applySimpleTemplate` leaves them verbatim — this divergence is the current contract, not a bug to fix here, but the test should assert the correct behavior per modality

## Non-goals

- Modality-specific payload parsers (LLM sections, video/audio scaffolds) — covered by `FEAT-065-sub-video.md`, `FEAT-065-sub-audio.md`, `TASK-template-unified-variable-engine.md`. New routes consume the existing service.
- Migration to a separate `template_variables` table — the JSON `payload` column model holds (decided 2026-09-27).
- Sharing/public marketplace (`public` visibility tier) — defer to a future ticket.

## Notes

- Owner identity comes from the existing session-derived `userId`; no new auth code.
- Video/audio routes can return 501 on `apply` until providers land (mirrors the FEAT-065-sub-* ticket contracts).
- Built-in rows are not in `prompt_templates` today — they live in config files (`configs/templates/llm.example.yaml`, etc.). If a future built-in registry inserts them, this route should detect `is_builtin` and short-circuit writes; current contract only needs to handle `owner_id IS NULL OR owner_id = caller`.
- **Flat routes precedent (2026-10-01):** `src/routes/templates/` shipped with flat URL shape (`/api/v1/templates`, `/api/v1/templates/:id`) via `content-surface.ts:64`. The remaining work is URL restructuring + modality guards, not new feature implementation.


git issue: b9f2c0f

**Resolved:** 2026-10-06 registry-driven close: git issue b9f2c0f (registry tip: 0141d4290 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-PUBLIC-TEMPLATES-ROUTES don)
