<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Template System — Unified Architecture Spec

**Status**: 🟡 In Progress — LLM-modality foundation shipped; DB-backed user templates + unified render future
**Owner**: FEAT-065 (Prompt Library)
**Scope**: LLM, Image, Video, Audio generation templates

---

## Current State (2026-08-03)

- ✅ **LLM-modality foundation shipped** — config-file builtins registry: `LLM_PROMPT_DEFAULTS` (12 purposes) + `resolveSystemPrompt()` (`src/prompts/registry.ts`), user overrides via `configs/templates/llm.yaml` (extend/override/replace), 10 consumers wired (commit `9aefe593`). This corresponds to the registry's `builtins` + config-overlay `resolve`; the `prompt_templates` DB table (`userTemplates`) and unified `{{variable}}` `render` remain future work (`TASK-prompt-library.md`).
- 🟡 Registry hardening (typed purposes, single defaults source, llm.yaml validation): `TASK-prompt-template-registry.md`, design `.plan/epics/epic-config-templates.md`.
- ⬜ DB `prompt_templates`/`template_variables` tables, `template-service.ts`, `/api/templates/:modality` routes, LLM `{{var}}` interpolation — future (Migration path below).

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
  modelMatching: { pattern: string; templateId: string }[];

  resolve(modelName?: string, templateId?: string,): TTemplate;
  render(template: TTemplate, ctx: TContext,): string;
}
```

### Modality Implementations

| Modality | Registry File                              | Template Type         | Context Type           |
| -------- | ------------------------------------------ | --------------------- | ---------------------- |
| LLM      | `src/assistant/prompt/registry.ts`         | `LlmPromptTemplate`   | `AssembleContext`      |
| Image    | `src/generation/prompt-templates.ts`       | `ImageModelProfile`   | `TemplateContext`      |
| Video    | `src/generation/video-prompt-templates.ts` | `VideoPromptTemplate` | `VideoTemplateContext` |
| Audio    | `src/generation/audio-prompt-templates.ts` | `AudioPromptTemplate` | `AudioTemplateContext` |

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

> **Note**: Image/video/audio may use modality-specific extension tables (`image_prompt_templates`, `video_prompt_templates`, `audio_prompt_templates`) for format/mode-specific columns. LLM uses section-based storage (see FEAT-065-LLM).

---

## Variable Substitution

All modalities share a `resolveTemplate(body, ctx)` function:

```typescript
function resolveTemplate(body: string, ctx: Record<string, string>,): string {
  return body.replaceAll(/\{\{(\w+)\}\}/g, (_, key,) => ctx[key] ?? "",);
}
```

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

Mirror `DEFAULT_PROFILE_REGISTRY.modelMatching` from `src/generation/prompt-templates.ts`:

```typescript
modelMatching: [
  { pattern: "flux", templateId: "flux", },
  { pattern: "sd3", templateId: "sd3", },
  { pattern: "wan", templateId: "wan", },
  { pattern: "eleven", templateId: "elevenlabs", },
  // ...
];
```

Resolution order: explicit `templateId` → `modelName` match → default per modality.

---

## Migration Path

| Phase | Work                                                     | Files                                      |
| ----- | -------------------------------------------------------- | ------------------------------------------ |
| 1     | Unified `prompt_templates` + `template_variables` tables | `src/db/migrations/0XX_templates.ts`       |
| 2     | `template-service.ts` (CRUD + render)                    | `src/generation/template-service.ts`       |
| 3     | API routes                                               | `src/routes/templates.ts`                  |
| 4     | Image wiring (FEAT-065-IMG)                              | `src/generation/image-gen-route.ts`        |
| 5     | LLM wiring (FEAT-065-LLM)                                | `src/assistant/prompt-assembler.ts`        |
| 6     | Video scaffold (FEAT-065-VID)                            | `src/generation/video-prompt-templates.ts` |
| 7     | Audio scaffold (FEAT-065-AUD)                            | `src/generation/audio-prompt-templates.ts` |

---

## References

- `src/generation/prompt-templates.ts` — Image implementation (reference pattern)
- `src/assistant/prompt-assembler.ts` — LLM section assembler
- `docs/spec/integrations/image-generation.md` — Image model families
- `docs/spec/integrations/llm-serving.md` — LLM presets
- `docs/ideas/prompt-output-control.md` — #9 Template marketplace
- `.plan/tickets/FEAT-065-prompt-library-expanded.md` — Parent task
- `.plan/tickets/FEAT-065-sub-{llm,image,video,audio}.md` — Subtasks
