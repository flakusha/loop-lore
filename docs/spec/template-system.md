<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Template System — Unified Architecture Spec

Status: Largely implemented (FEAT-065). Config-driven override layer shipped via `.plan/epics/epic-config-templates.md` (In Progress). Video/audio modalities are schema-ready but have no dedicated template code.

## Implemented

- Unified DB table `prompt_templates` — owner-scoped rows, `modality` CHECK (`llm|image|video|audio`), JSON `payload` column carrying the per-modality shape, `chats.prompt_template_id` FK (`src/db/migrations/001_init.ts`, `src/db/schema-core.ts`). Note: the spec's `template_variables` side table was NOT built — variables live in the payload JSON.
- Service — `src/generation/template-service/` (crud / resolve / apply) + `src/generation/template-types.ts` (per-modality payload contract).
- Routes — `src/routes/templates/` (CRUD, apply, transfer) plus admin custom profiles stored under `system_config` key `prompt_templates` (`src/routes/admin-templates/`).
- LLM wiring — `src/assistant/prompt/template-render.ts` (`assembleWithTemplate`); image wiring — `src/generation/image-gen-route.ts` (`getOwnedTemplate`); model→template matching for image profiles in `src/generation/prompt-templates/` (`resolution.ts`, `profiles.ts`).
- Config-driven overrides (merge strategies replace/extend/override) shipped for LLM/SD/avatar/image-edit — see the config-templates epic phases 1–4 + LLM cleanup.

## Not implemented / aspirational

- Video/audio template code (`video-prompt-templates.ts`, `audio-prompt-templates.ts` and their render paths) — the modality enum accepts rows, no dedicated implementation exists.
- Unified cross-modality variable matrix and detail-level token hints (instant 160 / balanced 320 / detailed 600) as one enforced contract — per-modality behavior only.

## Epics & tickets

- `.plan/epics/epic-config-templates.md` — config template system (config-surface owner).
- `.plan/tickets/FEAT-065-template-system.md`, `FEAT-065-prompt-library-expanded.md`, `FEAT-065-sub-llm.md`, `FEAT-065-sub-image.md`, `FEAT-065-sub-video.md`, `FEAT-065-sub-audio.md`.
