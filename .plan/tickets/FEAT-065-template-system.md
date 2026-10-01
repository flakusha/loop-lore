<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Template System — Unified Architecture Spec

**Status:** In Progress
**Status Note:** Reconciliation pass 2026-10-01 — Phases 1–4 shipped (DB table, service, admin routes, image wiring). Public template routes shipped at `/api/v1/templates` (flat, not per-modality nested). LLM static-content `{{var}}` substitution done in `template-render.ts:179-197`; user config (`llm.example.yaml`) variable substitution is not wired — tracked in `TASK-template-unified-variable-engine.md`. Video/audio scaffolds shipped 2026-10-01 (registries + `/api/templates/video|audio` routes; apply 501 until providers land). Migration path's `parts/` subdirectory reference is stale (actual: flat `NNN_name.ts` files in `src/db/migrations/`).

**Priority:** medium
**Effort:** Medium
**Summary:** Unified prompt template system across LLM/Image/Video/Audio modalities — shared `TemplateRegistry` interface, DB-backed user templates, per-modality registries, model→template auto-matching.
**Context:** Reconciliation passes 2026-09-13, 2026-09-23, 2026-09-27, 2026-10-01 — bookkeeping; sibling TASK tickets cross-linked below.
**Acceptance Criteria:** LLM + image modality registries + per-modality `{{var}}` substitution shipped; DB-backed `prompt_templates` shipped (JSON payload, not separate variables table); admin `/api/admin/templates` CRUD shipped; public `/api/v1/templates` routes shipped; video/audio scaffolds shipped 2026-10-01. Remaining: LLM config-layer `{{var}}` substitution (TASK-template-unified-variable-engine.md).

**Owner**: FEAT-065 (Prompt Library)
**Scope**: LLM, Image, Video, Audio generation templates

git issue: dc95659

## Current State (verified against code 2026-10-01)

- ✅ **LLM-modality foundation shipped** — `src/prompts/registry.ts` (`LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt()`), user overrides via `configs/templates/llm.example.yaml` (loaded via templates-loader; `llm.yaml` does not exist as a runtime file); `src/assistant/prompt/template-render.ts` renders LLM templates with section assembly. `prompt_templates` DB table exists with modality='llm' rows. `substituteVars()` at `template-render.ts:179-197` performs `{{charName}}`, `{{userName}}`, etc. substitution on static section content. However, `resolveSystemPrompt()` does not call `substituteVars()` on user config strings — gap tracked in `TASK-template-unified-variable-engine.md`.
- ✅ **Image-modality foundation shipped** — `src/generation/prompt-templates/` (`profiles.ts`, `config.ts`, `templates.ts`, `resolution.ts`, `messages.ts`, `types.ts`, `index.ts`), `resolveTemplate()` at `templates.ts:32`, user overlay via `configs/templates/sd.example.yaml`. Wired through `src/generation/image-gen-route.ts:94` (`applyImageTemplate`) and `template-service/apply.ts`.
- ✅ **DB + service phases shipped (with deviations)** — `prompt_templates` table in `src/db/migrations/001_init.ts:3297-3330`; check constraint `ck_prompt_templates_modality` at `001_init.ts:3308-3311`; `modality` relaxed to include `'workflow'` in `022_prompt_templates_workflow_modality.ts:72-75`. JSON `payload` column carries modality-specific shape — no `template_variables` table exists (grep confirms zero matches across `src/db/`). Service at `src/generation/template-service/{crud,apply,resolve,index}.ts`. Note: service is 4 files, not the single `template-service.ts` described in the old migration table.
- ✅ **Admin routes shipped** — `src/routes/admin-templates/{create,update,remove,list,index,shared}.ts` mounted at `/api/admin/templates` (admin-scoped).
- ✅ **Public template routes shipped** — `src/routes/templates/{crud,apply,transfer,index}.ts` + `templates.test.ts` mounted at `/api/v1/templates` (flat routes, registered via `src/routes/v1/content-surface.ts:64` with prefix `/api/v1`). `TASK-public-templates-routes.md` describes a planned per-modality nested shape (`/api/templates/:modality`) not yet implemented — see that ticket for gap detail.
- ✅ **LLM static-content `{{var}}` substitution shipped** — `substituteVars()` at `template-render.ts:179-197` substitutes `{{charName}}`, `{{userName}}`, `{{charPersonality}}`, `{{charScenario}}` on static section content. `resolveScalarVars()` at `template-render.ts:206-243` plumbs actor/persona data into the scalar map.
- 🟡 **LLM config-layer `{{var}}` substitution NOT wired** — `configs/templates/llm.example.yaml` contains `{{charName}}` tokens (line 18 `chat: "You are {{charName}}. {{charDescription}}"`) but `resolveSystemPrompt()` does not route config-returned strings through `substituteVars()`. Tracked in `TASK-template-unified-variable-engine.md`.
- 🟡 **Registry hardening** — tracked in `TASK-prompt-template-registry.md`, design `.plan/epics/epic-config-templates.md`.
- ✅ **Video/audio scaffolds shipped (2026-10-01)** — `src/generation/video-prompt-templates.ts` + `video-prompt-profiles.ts` and `src/generation/audio-prompt-templates.ts` + `audio-prompt-profiles.ts` (registries, model matching, `{{var}}` substitution, `buildXPromptMessages`); per-modality routes `/api/templates/video|audio` in `src/routes/templates/modality.ts` (CRUD 200, apply 501 until a provider lands); shared mechanics in `src/generation/modality-templates/shared.ts`. Deviation from sub-ticket migration AC: no `video_prompt_templates`/`audio_prompt_templates` tables — video/audio rows persist as `SimpleTemplatePayload` through the unified `prompt_templates` table (modality check already includes video/audio). Both tickets marked Done.
- 📌 **Follow-up tickets:**
  - `TASK-public-templates-routes.md` — **Partially Shipped — Stale**. Flat routes at `/api/v1/templates` exist; remaining gap is per-modality nesting + modality guards.
  - `FEAT-065-sub-video.md` — **Done 2026-10-01** (commit `e209fd55a`).
  - `FEAT-065-sub-audio.md` — **Done 2026-10-01** (commit `e209fd55a`).
  - `TASK-template-unified-variable-engine.md` — **Not Started**. Gap confirmed: config-layer `{{var}}` not resolved.

---

## Overview

Loop-lore needs a **unified prompt template system** spanning all generation modalities. Each modality (LLM, image, video, audio) has distinct prompt construction requirements: context injection strategy, logic, detail level, description form (tags vs natural language vs JSON vs SSML), and context limits all vary per modality and per model family.

This spec defines a shared `TemplateRegistry` interface and per-modality template schemas so that:

1. Users can save/customize templates per modality
2. Each model family auto-resolves to the correct template
3. Video/audio scaffold now, wire later

---

## Shared Interface

```typescript
interface TemplateRegistry<TTemplate, TContext,> {
  /** Built-in read-only templates */
  builtins: Record<string, TTemplate>;
  /** User-created templates (from DB) */
  userTemplates: Map<string, TTemplate>;
  /** Model name → template ID matching (first match wins) */
  modelMatching: { pattern: string; profileId: string }[];

  resolve(modelName?: string, profileId?: string,): TTemplate;
  render(template: TTemplate, ctx: TContext,): string;
}
```

### Modality Implementations

| Modality | Registry File                                                                           | Template Type                                        | Context Type           |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------- |
| LLM      | `src/prompts/registry.ts` (defaults) + `src/assistant/prompt/registry.ts` (sections)    | purpose defaults + `PROMPT_SECTIONS` builders        | `AssembleContext`      |
| Image    | `src/generation/prompt-templates/` (`profiles.ts`, `config.ts`, `templates.ts`)         | `ImageModelProfile` (`types.ts`)                     | `Record<string, string>` (`resolveTemplate` ctx) |
| Video    | `src/generation/video-prompt-templates.ts` (shipped `e209fd55a`) | `VideoPromptTemplate`                                | `VideoTemplateContext` |
| Audio    | `src/generation/audio-prompt-templates.ts` (shipped `e209fd55a`) | `AudioPromptTemplate`                                | `AudioTemplateContext` |

---

## DB Schema

### `prompt_templates` (unified parent table)

```sql
CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  modality TEXT NOT NULL, -- 'llm' | 'image' | 'video' | 'audio'
  model_family TEXT NOT NULL,
  name TEXT NOT NULL,
  template_body TEXT NOT NULL, -- contains {{variables}}
  detail_level TEXT NOT NULL DEFAULT 'balanced',
  is_builtin BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `template_variables`

> **Superseded (2026-09-27 decision):** The separate `template_variables` table was not created. The JSON `payload` column carries modality-specific variable shapes directly. This was a deliberate deviation.

```sql
-- NOT CREATED — variables live inside the JSON `payload` column per modality
```

---

## Variable Substitution

All modalities share a `resolveTemplate(body, ctx)` function:

```typescript
function resolveTemplate(body: string, ctx: Record<string, string>,): string {
  return body.replaceAll(/\{\{(\w+)\}\}/g, (_, key,) => ctx[key] ?? "",);
}
```

Shipped for the image modality (`src/generation/prompt-templates/templates.ts:32`). LLM static section content uses `substituteVars()` in `template-render.ts:179-197`. LLM config-layer (`llm.example.yaml`) substitution is not wired — tracked in `TASK-template-unified-variable-engine.md`.

### Cross-Modality Variables

| Variable              | LLM | Image | Video | Audio         |
| --------------------- | --- | ----- | ----- | ------------- |
| `{{charName}}`        | ✅* | ✅    | ✅    | ✅            |
| `{{charDescription}}` | ✅* | ✅    | ✅    | —             |
| `{{userName}}`        | ✅* | ✅    | ✅    | —             |
| `{{userDescription}}` | ✅* | ✅    | ✅    | —             |
| `{{chatHistory}}`     | ✅  | ✅    | —     | —             |
| `{{sceneSummary}}`    | ✅  | ✅    | ✅    | —             |
| `{{lastMessage}}`     | ✅  | ✅    | ✅    | ✅ (TTS text) |
| `{{negativePrompt}}`  | —   | ✅    | ✅    | —             |
| `{{motion}}`          | —   | —     | ✅    | —             |
| `{{cameraMovement}}`  | —   | —     | ✅    | —             |
| `{{speaker}}`         | —   | —     | —     | ✅            |
| `{{emotion}}`         | —   | —     | —     | ✅            |
| `{{genre}}`           | —   | —     | —     | ✅            |

\* LLM: substitution on static section content only; config-layer (`llm.example.yaml`) not yet wired (`TASK-template-unified-variable-engine.md`).

---

## Detail Levels (unified)

| Level      | Tokens (approx) | Use Case                      |
| ---------- | --------------- | ----------------------------- |
| `instant`  | 160             | Quick drafts, low-latency     |
| `balanced` | 320             | General purpose               |
| `detailed` | 600             | Maximum quality, high context |

> Video/audio may extend token hints per subtype (TTS short, music long).

---

## API Surface

### Public routes (shipped)

```
GET    /api/v1/templates         — list user templates + LLM presets
POST   /api/v1/templates         — create
GET    /api/v1/templates/:id     — retrieve (row or preset)
PATCH  /api/v1/templates/:id     — update (owner only)
DELETE /api/v1/templates/:id     — delete (owner only)
POST   /api/v1/templates/:id/apply — render with context
GET    /api/v1/templates/export  — JSON pack export
POST   /api/v1/templates/import  — JSON pack import
```

Registered via `src/routes/v1/content-surface.ts:64` with prefix `/api/v1`.

### Planned per-modality routes (open)

`TASK-public-templates-routes.md` tracks nested routes at `/api/templates/:modality`. Not yet implemented.

```
POST   /api/templates/:modality        # create
GET    /api/templates/:modality        # list (owner + builtin)
GET    /api/templates/:modality/:id    # retrieve
PATCH  /api/templates/:modality/:id    # update
DELETE /api/templates/:modality/:id    # delete
POST   /api/templates/:modality/:id/apply  # render with context
```

`:modality` ∈ {`llm`, `image`, `video`, `audio`}

---

## Model→Template Auto-Matching

Mirror `DEFAULT_PROFILE_REGISTRY.modelMatching` from `src/generation/prompt-templates/profiles.ts` (12 built-in profiles, `defaultProfileId: "sdxl"`):

```typescript
modelMatching: [
  { pattern: "flux", profileId: "flux", },
  { pattern: "sd3", profileId: "sd3", },
  { pattern: "noobai", profileId: "noob", },
  { pattern: "illustrious", profileId: "illustrious", },
  // ...
];
```

Resolution order: explicit `profileId` → `modelName` pattern match (first match wins) → `defaultProfileId` per modality.

---

## Migration Path

| Phase | Work                                                      | Actual Files (2026-10-01)                                         |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| 1     | Unified `prompt_templates` + variables table             | `src/db/migrations/001_init.ts:3297-3330` (no `template_variables` table; JSON `payload` used instead) |
| 2     | `template-service.ts` (CRUD + render)                    | `src/generation/template-service/{crud,apply,resolve,index}.ts` (4 files) |
| 3     | API routes                                               | `src/routes/admin-templates/` + `src/routes/templates/` (flat `/api/v1/templates`) |
| 4     | Image wiring                                             | `src/generation/image-gen-route.ts:94` (`applyImageTemplate`)  |
| 5     | LLM wiring                                               | `src/assistant/prompt/template-render.ts` — static section substitution done; config-layer not wired |
| 6     | Video scaffold                                           | `src/generation/video-prompt-templates.ts` (shipped `e209fd55a`) |
| 7     | Audio scaffold                                           | `src/generation/audio-prompt-templates.ts` (shipped `e209fd55a`) |

> **Note:** The original migration path referenced `src/db/migrations/parts/NNN_templates.ts`. The `parts/` subdirectory does not exist. Migrations are flat `NNN_name.ts` files in `src/db/migrations/` (confirmed 2026-10-01).

---

## References

- `src/generation/prompt-templates/` — Image implementation (reference pattern)
- `src/assistant/prompt-assembler.ts` — LLM section assembler
- `docs/spec/integrations/image-generation.md` — Image model families
- `docs/spec/integrations/llm-serving.md` — LLM presets
- `docs/ideas/prompt-output-control.md` — #9 Template marketplace
- `.plan/tickets/FEAT-065-prompt-library-expanded.md` — Parent task
- `.plan/tickets/TASK-prompt-library.md` — LLM user-template follow-up
- `.plan/tickets/TASK-prompt-template-registry.md` — Registry hardening
- `.plan/tickets/TASK-template-unified-variable-engine.md` — Unified `{{var}}` engine
- `.plan/tickets/TASK-templates-loader-merge-strategy-consistency.md` — Loader merge strategy
