<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Template System — Unified Architecture Spec

**Status:** In Progress
**Status Note:** Reconciliation pass 2026-09-27 — Phases 1–3 effectively shipped with deviations from this spec. DB lives as a single `prompt_templates` table with a JSON `payload` column (no separate `template_variables` table — payload shape varies per modality). Service lives at `src/generation/template-service/{crud,apply,resolve}.ts`. HTTP routes live at `/api/admin/templates` (admin-scoped) rather than `/api/templates/:modality`. 33 tests pass: `template-service.test.ts` ×9, `routes/admin-templates.coverage.test.ts` + `admin-templates-gate.test.ts` ×17, `assistant/prompt/template-render.test.ts` ×7. Update 2026-10-01 — video/audio scaffolds shipped (FEAT-065-sub-video, FEAT-065-sub-audio): modality registries + per-modality `/api/templates/video|audio` routes (CRUD 200, apply 501 until providers land) with no new migrations — video/audio rows persist through the unified table, per the reconciled design above.
**Priority:** medium
**Effort:** Medium
**Summary:** Unified prompt template system across LLM/Image/Video/Audio modalities — shared `TemplateRegistry` interface, DB-backed user templates, per-modality registries, model→template auto-matching.
**Context:** Reconciliation passes 2026-09-13, 2026-09-23, 2026-09-27 — bookkeeping; sibling TASK tickets cross-linked below.
**Acceptance Criteria:** LLM + image modality registries + per-modality `{{var}}` substitution shipped; DB-backed `prompt_templates` shipped (JSON payload, not separate variables table); admin `/api/admin/templates` CRUD shipped; public unified `/api/templates` CRUD + apply shipped. Video/audio scaffolds shipped 2026-10-01 (registries + `/api/templates/video|audio` routes; apply 501 until providers land). Remaining: LLM `{{var}}` interpolation in LLM section assembler.


**Owner**: FEAT-065 (Prompt Library)
**Scope**: LLM, Image, Video, Audio generation templates


git issue: dc95659

## Current State (verified against code 2026-09-27)

- ✅ **LLM-modality foundation shipped** — `src/prompts/registry.ts` (`LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt()`), user overrides via `configs/templates/llm.yaml`; `src/assistant/prompt/template-render.ts` renders LLM templates with section assembly. `prompt_templates` DB table exists with modality='llm' rows; per-template LLM `{{var}}` interpolation in section assembler still future (TASK-template-unified-variable-engine.md).
- ✅ **Image-modality foundation shipped** — `src/generation/prompt-templates/` (`profiles.ts`, `config.ts`, `templates.ts`), shared `resolveTemplate()` `{{variable}}` substitution, user overlay via `configs/templates/sd.yaml`. Wired through `src/generation/image-gen-route.ts` and `template-service/apply.ts` (`applyImageTemplate`).
- ✅ **DB + service phases shipped (with deviations)** — `prompt_templates` table exists in `src/db/migrations/001_init.ts` (lines 3296–3330): one row per template, `modality` check-constrained to `('llm','image','video','audio')`, JSON `payload` column carries modality-specific shape (no separate `template_variables` table — payload IS the variables). Service at `src/generation/template-service/{crud,apply,resolve,index}.ts` covers CRUD + render + chat-level override resolution. 9 service tests pass.
- ✅ **Admin routes shipped** — `src/routes/admin-templates/{create,update,remove,list,index,shared}.ts` mounted at `/api/admin/templates` (admin-scoped). 17 admin-templates tests pass.
- 🟡 Registry hardening (typed purposes, single defaults source, llm.yaml validation): `TASK-prompt-template-registry.md`, design `.plan/epics/epic-config-templates.md`.
- ✅ **Video/audio scaffolds shipped (2026-10-01)** — `src/generation/video-prompt-templates.ts` + `video-prompt-profiles.ts` and `src/generation/audio-prompt-templates.ts` + `audio-prompt-profiles.ts` (registries, model matching, `{{var}}` substitution, `buildXPromptMessages`); per-modality routes `/api/templates/video|audio` in `src/routes/templates/modality.ts` (CRUD 200, apply 501 until a provider lands); shared mechanics in `src/generation/modality-templates/shared.ts`.
- ⬜ Public per-modality routes for llm/image (`/api/templates/:modality`) — llm/image remain on the unified `/api/templates` surface (see follow-up tickets below).
- 📌 **Follow-up tickets (filed 2026-09-27):**
  - `TASK-public-templates-routes.md` — Phase 3 (public `/api/templates/:modality`); no current duplicate.
  - `FEAT-065-sub-video.md` — Phase 6 (video scaffold); **Done 2026-10-01**.
  - `FEAT-065-sub-audio.md` — Phase 7 (audio scaffold); **Done 2026-10-01**.
  - `TASK-template-unified-variable-engine.md` — Phase 5 (LLM `{{var}}` interpolation); already tracked.

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
| Video    | `src/generation/video-prompt-templates.ts` (to create)                                  | `VideoPromptTemplate`                                | `VideoTemplateContext` |
| Audio    | `src/generation/audio-prompt-templates.ts` (to create)                                  | `AudioPromptTemplate`                                | `AudioTemplateContext` |

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

```sql
CREATE TABLE template_variables (
  template_id TEXT NOT NULL,
  key TEXT NOT NULL,
  default_value TEXT,
  description TEXT,
  PRIMARY KEY (template_id, key)
);
```

> **Note**: Image/video/audio may use modality-specific extension tables (`image_prompt_templates`, `video_prompt_templates`, `audio_prompt_templates`) for format/mode-specific columns. LLM uses section-based storage; that decision is tracked with the parent task `FEAT-065-prompt-library-expanded.md`.

---

## Variable Substitution

All modalities share a `resolveTemplate(body, ctx)` function:

```typescript
function resolveTemplate(body: string, ctx: Record<string, string>,): string {
  return body.replaceAll(/\{\{(\w+)\}\}/g, (_, key,) => ctx[key] ?? "",);
}
```

Shipped for the image modality (`src/generation/prompt-templates/templates.ts`, re-exported via `index.ts`); LLM/video/audio adopt it with their wiring phases.

### Cross-Modality Variables

| Variable              | LLM | Image | Video | Audio         |
| --------------------- | --- | ----- | ----- | ------------- |
| `{{charName}}`        | ✅  | ✅    | ✅    | ✅            |
| `{{charDescription}}` | ✅  | ✅    | ✅    | —             |
| `{{userName}}`        | ✅  | ✅    | ✅    | —             |
| `{{userDescription}}` | ✅  | ✅    | ✅    | —             |
| `{{chatHistory}}`     | ✅  | ✅    | —     | —             |
| `{{sceneSummary}}`    | ✅  | ✅    | ✅    | —             |
| `{{lastMessage}}`     | ✅  | ✅    | ✅    | ✅ (TTS text) |
| `{{negativePrompt}}`  | —   | ✅    | ✅    | —             |
| `{{motion}}`          | —   | —     | ✅    | —             |
| `{{cameraMovement}}`  | —   | —     | ✅    | —             |
| `{{speaker}}`         | —   | —     | —     | ✅            |
| `{{emotion}}`         | —   | —     | —     | ✅            |
| `{{genre}}`           | —   | —     | —     | ✅            |

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

| Phase | Work                                                     | Files                                      |
| ----- | -------------------------------------------------------- | ------------------------------------------ |
| 1     | Unified `prompt_templates` + `template_variables` tables | `src/db/migrations/parts/NNN_templates.ts` (append-only `parts/` layout, orchestrated by `001_init.ts`) |
| 2     | `template-service.ts` (CRUD + render)                    | `src/generation/template-service.ts`       |
| 3     | API routes                                               | `src/routes/templates.ts`                  |
| 4     | Image wiring                                             | `src/generation/image-gen-route.ts`        |
| 5     | LLM wiring                                               | `src/assistant/prompt-assembler.ts`        |
| 6     | Video scaffold                                           | `src/generation/video-prompt-templates.ts` |
| 7     | Audio scaffold                                           | `src/generation/audio-prompt-templates.ts` |

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
