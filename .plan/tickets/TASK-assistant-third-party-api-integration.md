# TASK: Assistant — Third-Party API Integration (Nano Banana, etc.)

**Status:** 📝 Draft
**Priority:** High (post-Gate C)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows`
**Depends on:** `TASK-assistant-creative-studio-workflows.md` (workflow runner, model family presets)

## Summary

Implement the dispatch-layer integration for third-party image/video generation APIs
(Nano Banana, Minimax H3, Ideogram 4, etc.) accessed through the workflow template system.
This is the **dispatch adapter layer** — NOT the API provider implementation itself
(that lives in `epic-audio-video-sound.md` / `epic-assistant-generation-extensions.md`).

Each third-party API has a different:

- Request format / payload schema
- Authentication model (API key, OAuth, BYO key)
- Rate limits and throughput constraints
- Response format (image URL, video URL, base64)
- Error model

Workflow templates declare `dispatch.backend: api_call` with a `target` that maps to
a registered third-party API adapter. The dispatch layer resolves the adapter, injects
the model-family-formatted prompt + parameters from the workflow steps, and routes the
request through the LLM queue (`epic-llm-queue.md`).

## Current State (2026-08-08)

- `src/assistant/commands/image.ts` — `/image` command returns a frontend action dispatch
  (`action: "generate-image"`, 832 bytes), no backend adapter wiring.
- `src/assistant/sd.ts` — `SDRequest` / `generateImage` / `getAssetKind` / `buildEntityPrompt`
  are dead stubs (no provider wiring).
- No third-party API dispatch route exists. No `configs/templates/workflows/` directory.
- Model family presets (tags vs natural vs JSON vs edit-instruction) are not implemented.

## Design

### Dispatch Adapter Interface

```typescript
interface ThirdPartyAdapter {
  id: string; // e.g. "nano-banana", "minimax-h3", "ideogram-4"
  name: string; // human-readable
  model_family: string; // e.g. "z-image", "minimax-h3", "ideogram-4"
  endpoint: string; // API endpoint
  auth: "api_key" | "oauth" | "byo_key";
  buildPayload(workflow_result: WorkflowResult,): Promise<ThirdPartyPayload>;
  parseResponse(response: unknown,): Promise<ThirdPartyResult>;
  getRateLimit?: () => { requests_per_minute: number; tokens_per_minute: number };
}
```

### Model-Family-Aware Payload Building

Each adapter reads the workflow's assembled steps + the active model_family preset
(`configs/templates/workflows/model-families.yaml`) and builds the provider-specific
payload:

| Model family  | Payload structure                                                               |
| ------------- | ------------------------------------------------------------------------------- |
| `sd-1-5`      | `{"prompt": "tags", "negative_prompt": "...", "steps": N, "cfg_scale": N, ...}` |
| `sdxl`        | `{"prompt": "natural desc, (tag:1.2)", "steps": N, ...}`                        |
| `flux`        | `{"prompt": "natural description", "steps": N, ...}`                            |
| `qwen-edit`   | `{"prompt": "keep X, change Y to Z", "ref_image": "..."}`                       |
| `ideogram-4`  | `{"text_prompt": "...", "style": "...", "color_palette": "..."}`                |
| `z-image`     | `{"prompt": "tags", "steps": N, "cfg_scale": N, ...}`                           |
| `minimax-h3`  | `{"prompt": "natural", "duration": N, "resolution": "..."}`                     |
| `wan` / `ltx` | `{"prompt": "natural", "duration": N, "fps": N}`                                |

### Third-Party API Registry

Adapters registered via the plugin extension point `PluginExtensionPoint<"third-party-apis">`
or defined declaratively in `configs/templates/workflows/third-party-adapters.yaml`:

```yaml
adapters:
  nano-banana:
    name: "Nano Banana"
    model_family: z-image
    endpoint: https://api.nanobanana.ai/v1/imagine
    auth: byo_key
    payload_template: |
      {"prompt": "{{format_prompt}}", "steps": {{parameters.steps}}, ...}
  ideogram-4:
    name: "Ideogram 4"
    model_family: ideogram-4
    endpoint: https://api.ideogram.ai/generate
    auth: byo_key
    payload_template: |
      {"text_prompt": "{{steps.subject.value}}",
       "style": "{{steps.style.value}}",
       "color_palette": "{{steps.palette.value}}"}
```

## Scope

- Third-party API adapter interface + registry
- Payload builder engine that reads model_family presets + workflow steps
- Response parser + asset attachment to chat
- Rate-limit awareness (route through LLM queue)
- Third-party API adapter config in `configs/templates/workflows/`
- Integration with the workflow runner's dispatch layer
- Tests for payload building per model family

### Non-goals

- Implementing actual API provider clients (that's `epic-audio-video-sound.md` /
  `epic-assistant-generation-extensions.md`)
- NSFW prefiltering/consent (that's `TASK-assistant-nsfw-api-prefiltering.md`)
- ComfyUI/sd.cpp backends (that's `epic-assistant-generation-extensions.md` Phase 1-3)

## Tasks

- [ ] Define `ThirdPartyAdapter` interface + registry in `src/assistant/`
- [ ] Implement payload builder engine (reads model_family preset + workflow steps)
- [ ] Create `configs/templates/workflows/third-party-adapters.yaml` with Nano Banana + Ideogram 4
- [ ] Implement response parser + asset attachment
- [ ] Add rate-limit awareness (route through LLM queue)
- [ ] Wire third-party dispatch into `src/assistant/workflow-runner.ts` `dispatch` path
- [ ] Unit tests for payload building per model family (SD tags, Flux natural, Ideogram JSON)

## Files

| File                                                    | Status                        |
| ------------------------------------------------------- | ----------------------------- |
| `src/assistant/third-party-adapters.ts`                 | new                           |
| `src/assistant/third-party-adapters.test.ts`            | new                           |
| `configs/templates/workflows/third-party-adapters.yaml` | new                           |
| `src/assistant/workflow-runner.ts`                      | modify (dispatch integration) |

## Acceptance Criteria

- [ ] Third-party API adapter interface defined and extensible
- [ ] Payload builder produces correct format per model family (tags, natural, JSON, edit-instruction)
- [ ] Nano Banana (z-image) adapter configured
- [ ] Ideogram 4 (JSON prompt) adapter configured
- [ ] Response parser attaches result as chat asset
- [ ] Rate-limit awareness integrated with LLM queue
- [ ] Unit tests for payload building per model family
- [ ] Workflow dispatch routes `api_call` backends to the correct adapter

## Related

- **Epic:** `epic-assistant-creative-studio-workflows.md`
- **Task:** `TASK-assistant-creative-studio-workflows.md` — workflow runner, model family presets
- **Task:** `TASK-assistant-nsfw-api-prefiltering.md` — NSFW prefiltering + consent
- **Epics:** `epic-audio-video-sound.md`, `epic-assistant-generation-extensions.md`,
  `epic-llm-queue.md`
