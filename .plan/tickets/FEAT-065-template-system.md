<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Template System — Unified Architecture Spec

**Status:** 🟡 In Progress — LLM + image template foundations shipped (spec reconciled with code 2026-09-13); DB-backed user templates + unified registry future
**Priority:** medium
**Effort:** Medium
**Summary:** Unified prompt template system across LLM/Image/Video/Audio modalities — shared `TemplateRegistry` interface, DB-backed user templates, per-modality registries, model→template auto-matching.
**Context:** Reconciliation pass 2026-09-23 — collapsed two duplicate `Status:` lines, kept the longer narrative (bookkeeping 2026-09-19) in the single header; sibling TASK tickets cross-linked below.
**Acceptance Criteria:** LLM and image modality registries + per-modality `{{var}}` substitution shipped; DB-backed unified `prompt_templates` + `template_variables` tables, `/api/templates/:modality` routes, video/audio scaffolds future.


**Owner**: FEAT-065 (Prompt Library)
**Scope**: LLM, Image, Video, Audio generation templates

---

## Current State (verified against code 2026-09-13)

- ✅ **LLM-modality foundation shipped** — config-file builtins registry: `LLM_PROMPT_DEFAULTS` (12 purposes) + `resolveSystemPrompt()` (`src/prompts/registry.ts`), user overrides via `configs/templates/llm.yaml` (extend/override/replace; examples: `llm.example.yaml` / `llm.example.toml`). LLM prompt sections are ordered builders in `src/assistant/prompt/registry.ts` (`PROMPT_SECTIONS`), consumed by `src/assistant/prompt-assembler.ts`. The `prompt_templates` DB table (`userTemplates`) and unified `{{variable}}` `render` for LLM remain future work (`TASK-prompt-library.md`).
- ✅ **Image-modality foundation shipped** — `src/generation/prompt-templates/` module: `BUILTIN_PROFILES` / `DEFAULT_PROFILE_REGISTRY` (`profiles.ts`), shared `resolveTemplate()` `{{variable}}` substitution (`templates.ts`), user overlay via `configs/templates/sd.yaml` (`createConfigRegistry` in `config.ts`). Detail levels `instant` / `balanced` / `detailed` already unified.
- 🟡 Registry hardening (typed purposes, single defaults source, llm.yaml validation): `TASK-prompt-template-registry.md`, design `.plan/epics/epic-config-templates.md`.
- ⬜ DB `prompt_templates` / `template_variables` tables (absent from migrations today), `template-service.ts`, `/api/templates/:modality` routes, LLM `{{var}}` interpolation — future (Migration path below).

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
