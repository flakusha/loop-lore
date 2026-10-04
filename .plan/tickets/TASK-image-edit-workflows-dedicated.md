<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Image-Edit Workflows as First-Class (builtin templates → edit provider → asset)

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** image-edit, comfyui, workflows, templates, assets
**Epic:** epic-comfyui-plugin
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Make image-edit workflows first-class: builtin TS templates build
workflows, the edit provider executes them via ComfyUI/sd-server, and
results persist as assets. Covers the provider/template substrate; the
gallery UX on top lives elsewhere.

## Context

`src/image-edit/` layout at HEAD (grep-verified): `template-registry.ts`
(registry + `registerBuiltinTemplates` / `registerConfigWorkflows`),
`templates/builtin/` (5 registered templates: `txt2img`, `img2img`, `inpaint`,
`upscale`, `controlnet` — see `templates/builtin/index.ts`; `lora.ts` is NOT a
registered template, it exports only `parseLoraString`/`buildLoraNodes` helpers
consumed as a `loras` string param by `txt2img` — no `ImageEditCategory` member
for lora, see `types.ts:19-24`), `providers/comfyui-provider.ts`
(`ComfyUIEditProvider.execute` downloads + `createAsset`/`linkAsset`),
`providers/sd-server-provider/`, `routes.ts` (`handleRun`, templates,
nodes, capabilities, health — served at `/api/v1/image-edit/*`),
`run-authz.ts` (`authorizeRunLinkage`), `types.ts`. Config-driven
workflows merge via `image-edit.yaml` (`src/config/templates-loader/`).
Epic gaps: FLUX.1 Kontext / Qwen Edit / Krea 2 templates pending
(`configs/workflows/`), GGUF loading pending.

## Scope boundary (vs gallery-edit UX ticket — reference, don't duplicate)

- `TASK-assistant-creative-studio-workflow-gallery-edit.md` owns the
  assistant/gallery UX: asset → edit-workflow binding, `gallery-edit.yaml`,
  prompt-preview + confirmation gating, `backend: image_edit` dispatch,
  qwen-edit `modes: [t2i, i2i]`, ControlNet/LoRA-as-parameters.
  It dispatches to `handleRun` — it does NOT build templates or providers.
- THIS ticket owns everything behind `handleRun`: builtin template
  completeness/correctness, provider execution + persistence, node
  discovery, capability filtering, error shapes.
- Do NOT touch gallery UI, assistant workflow YAML, or confirmation gating here.

## Acceptance Criteria

- [ ] Builtin templates (`txt2img`/`img2img`/`inpaint`/`upscale`/`controlnet`) each build valid ComfyUI workflow JSON; missing-`required_nodes` backends filtered via node discovery (`/object_info`). LoRA covered as a parameter, not a template: `loras` string param on `txt2img` at HEAD via `buildLoraNodes`/`parseLoraString` (`templates/builtin/lora.ts`) inserts `LoraLoader` nodes (pinned by `templates.coverage.test.ts` lora-injection tests); extend the same param to `img2img`/`inpaint`
- [ ] `ComfyUIEditProvider.execute` runs template → downloads output → `createAsset`/`linkAsset` with world scope / ownership; regression test pins persistence (epic 2026-09-25 correction)
- [ ] `POST /api/v1/image-edit/run` validates (`template_id` + `backend` + params), enforces `authorizeRunLinkage`, returns typed error shapes (400/401/403) with regression coverage
- [ ] `GET /api/v1/image-edit/templates|nodes|capabilities|health` reflect registry + installed nodes (template editor UI can render parameter forms)
- [ ] Tests: `src/image-edit/templates/builtin/templates.coverage.test.ts` + `src/image-edit/routes.coverage.test.ts` green; new coverage for error shapes + persist-pin + capability filtering

## Related

- `epic-comfyui-plugin.md` (Phase 1 template system, Phase 2 text-guided templates)
- `TASK-assistant-creative-studio-workflow-gallery-edit.md` (gallery UX — dispatches here)
- `src/image-edit/` (substrate), `configs/workflows/*.json` (on-disk templates)
