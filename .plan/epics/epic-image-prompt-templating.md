<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Image Prompt Templating & Variance

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** P2
**Effort:** Large
**Type:** Feature Epic / Generation
**Tags:** generation, image, templates, config, comfyui
**Issue:** (none)

## Summary

Provider-aware prompt templating for image generation: declared template
variables, `{a|b}` variance expansion, provider profile corrections,
user-supplied prompt-template packs under `configs/templates/`, and
search/tags over the prompt-template library. Grounded in an adoption
review of the krea2 prompt-skill approach: loop-lore already has the four
structural layers (provider profiles `src/generation/prompt-templates/`,
user template library `src/generation/template-service/`,
`configs/templates/` file layer, live image surfaces), but the live route
never consults the profile registry, image payloads declare no variables,
emotion-avatar prompts are family-blind tag concatenation, and the krea2
profile defaults diverge from upstream.

## Why

Verified gaps today:

1. `handleImageGeneration` consults only `templateId` or a raw prompt —
   no format/profile resolution.
2. `ImageTemplatePayload` is a bare `templateBody`; unknown `{{tokens}}`
   silently render empty (`apply.ts`), and there is no token validation
   (the declared-parameter rule exists only for workflows).
3. The LLM-writer path (`buildImagePrompt`/`resolveProfile`) is test-only
   while the registry constants are read only by admin routes.
4. Emotion-avatar prompt assembly is family-blind tag concatenation
   regardless of provider.
5. The krea2 profile ships stale defaults (cfgScale 7 / steps 12) with no
   `shift` field and no turbo/raw split.
6. No tags column or search on `prompt_templates`.

## Phased design

### Phase 1 — Variables, variance, batch (FEAT-image-template-variables-with-variance-expansion)

- Declared `variables` on `ImageTemplatePayload` mirroring
  `WorkflowPayload.parameters`; validation at `serializeTemplateInput`
  and `handleImageGeneration`.
- Lint declared-vs-used tokens plus variance lint: unbalanced/nested
  braces, `|` inside `{{var}}` is not a separator, empty alternatives
  rejected; v1 flat alternations only.
- `{a|b}` expansion at render time in `applyImageTemplate` AFTER
  `{{var}}` substitution, seed-deterministic per (seed, template id,
  variable map, item index).
- Full variance resolution completes in the backend before any provider
  call — no unresolved variance syntax may reach a provider (sdcpp
  processes raw strings and has no native wildcard support; this is the
  only expansion path there).
- Batch dispatch becomes per-item so each batch item gets its own
  resolved prompt (today one batched request carries one static prompt;
  ComfyUI ignores `n` entirely).

### Phase 2 — Profile corrections (FEAT-krea-2-model-profile-corrections)

- Split `krea2` into turbo/raw profiles, add `shift` to `ModelDefaults`,
  align defaults with upstream guidance, extend `modelMatching`, label
  values as upstream snapshots, keep operator overrides
  (`SdProfileOverride`) winning.

### Phase 3 — Packs & import (FEAT-image-prompt-template-packs + TASK-resolve-dormant-emotionentry-prompt-field)

- Multi-file domain `configs/templates/image-prompts/*.yaml` seeded into
  `prompt_templates` rows (workflow-seed pattern).
- Classifier-pack envelope (`serves`/`tags`/`when`/`priority`/`labels`).
- Selection function + dispatch on the emotion-avatar and image-gen
  surfaces with fallback to current inline assembly.
- Optional runtime import of user-provided wildcard libraries
  (`__name__` .txt/YAML, nested refs resolved at import time, render
  pipeline stays flat) and MOSS-style character/style catalog JSON
  (prompt-text only; content never bundled — third-party character
  rights are explicitly not granted by that project's NOTICE).

### Phase 4 — Search & tags (FEAT-prompt-template-search-and-tags)

- `tags` column on `prompt_templates`, `q` filter on the templates list
  route, join the layered tag-authority model from the classifier epic.

## Open questions

1. `serves` typed per surface vs free-form (proposal: typed for
   emotion-avatar/image-edit/chat-image, string beyond)?
2. One pack namespace for decision + image templates vs separate domains
   (proposal: shared envelope schema, separate directories)?
3. Ship or formally park the dormant LLM image-prompt writer
   (TASK-decide-llm-image-prompt-writer-fate)?
4. Wire or drop the dormant `EmotionEntry.prompt` config field
   (TASK-resolve-dormant-emotionentry-prompt-field)?

## Related

- `epic-classifier-template-packs.md` — source of the pack envelope,
  selection precedence, and layered tag authority this epic reuses.
- `epic-model-family-presets.md` — the krea-2 YAML preset there is
  superseded-in-part by Phase 2's profile corrections (keep both,
  cross-reference).
- `epic-config-templates.md` — shipped the loader/merge precedent this
  epic extends.
