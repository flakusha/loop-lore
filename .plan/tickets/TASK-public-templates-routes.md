<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Public per-modality templates routes

**Status:** Not Started
**Priority:** medium
**Effort:** Small–Medium
**Summary:** Add public `/api/templates/:modality` routes that wrap the existing template service with route-level auth and modality guards, mirroring `admin-templates/` but scoped to end users.
**Context:** `/api/admin/templates` already covers admin-only CRUD across `llm`/`image`/`video`/`audio` (see `src/routes/admin-templates/`). FEAT-065 Phase 3 calls for a public per-modality surface so non-admins can manage their own templates and each modality gets a stable URL. The admin service layer (`src/generation/template-service/`) is reusable; this ticket adds route-level ownership + modality guards and a thin `apply` endpoint that returns rendered text.
**Acceptance Criteria:**

- [ ] `GET/POST /api/templates/:modality`, `GET/PATCH/DELETE /api/templates/:modality/:id`, `POST /api/templates/:modality/:id/apply` mounted and registered in `register-plugins.ts`
- [ ] Owner-only writes; built-in rows are immutable via this surface
- [ ] `apply` returns the rendered string via `template-service/apply.ts` (`applyImageTemplate` / `applySimpleTemplate` for LLM via existing render path)
- [ ] Elysia `t` (TypeBox) request/response schemas; validation rejects unknown modality values
- [ ] Tests: owner-create-then-list, non-owner PATCH/DELETE 403, built-in PATCH 405, apply with missing variables renders empty for unknown tokens
- [ ] `admin-templates/` routes unchanged; surface is additive
**Epic:** epic-config-templates (FEAT-065 umbrella)
**Refs:** `FEAT-065-template-system.md` (Phase 3), `FEAT-065-sub-video.md`, `FEAT-065-sub-audio.md`, `TASK-template-unified-variable-engine.md`, `src/routes/admin-templates/` (admin-scoped reference impl)

## Problem

`/api/admin/templates` ships and covers admin-only CRUD for all four modalities (`src/routes/admin-templates/{list,create,update,remove,index,shared}.ts`). The spec at `FEAT-065-template-system.md` calls for a **public per-modality** surface at `/api/templates/:modality` so end users (not just admins) can manage their own templates and so each modality gets a stable, discoverable URL shape.

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

- [ ] Routes mounted at `/api/templates/:modality[/...]` and registered in `register-plugins.ts`
- [ ] Owner-only write enforcement; built-in rows are immutable via this surface
- [ ] `apply` endpoint renders via `template-service/apply.ts` (`applyImageTemplate` / `applySimpleTemplate` for LLM via existing render path) and returns the substituted string
- [ ] Elysia `t` (TypeBox) request/response schemas; validation rejects unknown modality values
- [ ] Tests: owner-create-then-list happy path, non-owner PATCH/DELETE 403, built-in PATCH 405, apply with missing variables renders empty for unknown tokens (matches `resolveTemplate` contract)
- [ ] `admin-templates/` routes unchanged; this surface is additive

## Non-goals

- Modality-specific payload parsers (LLM sections, video/audio scaffolds) — covered by `FEAT-065-sub-video.md`, `FEAT-065-sub-audio.md`, `TASK-template-unified-variable-engine.md`. New routes consume the existing service.
- Migration to a separate `template_variables` table — the JSON `payload` column model holds (decided 2026-09-27).
- Sharing/public marketplace (`public` visibility tier) — defer to a future ticket.

## Notes

- Owner identity comes from the existing session-derived `userId`; no new auth code.
- Video/audio routes can return 501 on `apply` until providers land (mirrors the FEAT-065-sub-* ticket contracts).
- Built-in rows are not in `prompt_templates` today — they live in config files (`configs/templates/llm.yaml`, etc.). If a future built-in registry inserts them, this route should detect `is_builtin` and short-circuit writes; current contract only needs to handle `owner_id IS NULL OR owner_id = caller`.
