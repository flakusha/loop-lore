---
title: "FEAT-065: Prompt library — expanded scope"
status: open
priority: medium
labels: [feature, prompt-system, generation]
epic: epic-config-templates
related: [FEAT-065-IMG, FEAT-065-AUD, FEAT-065-VID, FEAT-065-LLM, FEAT-055]
---

# FEAT-065: Prompt library — expanded scope (generation templates)

## What

Extend the existing prompt registry (`src/prompts/registry.ts`) beyond LLM system prompts to support image, audio, and video generation templates with per-provider adapters and a browsable UI.

## Why

The prompt registry already handles LLM system prompts with purpose-keyed defaults + config overlay. But image/audio/video generation each have their own prompt formats (ComfyUI workflows, Stable Diffusion prompts, music generation parameters). Users need a unified way to browse, customize, and share prompt templates across all generation modalities.

## Current State

- `src/prompts/registry.ts` — `LLM_PROMPT_DEFAULTS` keyed by `PromptPurpose`, resolved via `resolveSystemPrompt()`
- `src/prompts/purposes.ts` — purpose enum (assistant, gm, nsfw, vn, aux classifiers)
- `src/config/sections/templates.ts` — `LlmTemplateConfig` for user overrides
- `src/config/templates/llm.yaml` — user-editable prompt overrides
- `FEAT-065-sub-image.md`, `FEAT-065-sub-audio.md`, `FEAT-065-sub-video.md`, `FEAT-065-sub-llm.md` — sub-feature stubs

## Acceptance Criteria

- [ ] **Image prompt templates** (`FEAT-065-sub-IMG`) — SD/ComfyUI-compatible prompt+negative_prompt templates with style presets, per-character style inheritance
- [ ] **Audio prompt templates** (`FEAT-065-sub-AUD`) — music/SFX generation parameter templates (genre, mood, instrument, duration)
- [ ] **Video prompt templates** (`FEAT-065-sub-VID`) — video generation prompt templates with scene description, camera motion, duration
- [ ] **LLM template expansion** (`FEAT-065-sub-LLM`) — per-purpose templates for all generation hooks (not just system prompts): transition prompts, extraction prompts, intent classification
- [ ] **Unified template registry** — single `TemplateRegistry` interface serving all modalities with `resolve<T>(modality, purpose, overrides): T`
- [ ] **Template browsing UI** — settings panel listing all templates with preview, edit, reset-to-default
- [ ] **Import/export** — template packs as JSON/YAML files for sharing
- [ ] Unit tests for resolution chain (default → config → per-chat override)

## Implementation Notes

- Extend `PromptPurpose` → `TemplatePurpose` covering image/audio/video/llm
- `LLM_PROMPT_DEFAULTS` becomes `TEMPLATE_DEFAULTS` with nested modality keys
- Config: `configs/templates/{llm,image,audio,video}.yaml` (parallel structure)
- Per-provider adapters: normalize prompt format for SD vs ComfyUI vs DALL-E
- UI: Alpine component in settings modal, tabbed by modality
- Size gate: template registry files <250L each

## Dependencies

- Blocked by: nothing (extends existing registry)
- Blocks: nothing
