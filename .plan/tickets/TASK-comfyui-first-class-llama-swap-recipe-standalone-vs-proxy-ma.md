<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: llama-swap recipe standalone-vs-proxy matrix + docs

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-comfyui-plugin
**Tags:** comfyui, llama-swap, docs

**Summary:** Document the standalone-vs-proxy deployment matrix in recipe + specs, and promote image-generation.md ComfyUI from 'Future' to first-class.

**Context:**

The live `configs/config.llama-swap.yaml` on this machine currently carries LLM entries only — no `comfyui_auto`, no helpers group (the example file has the full recipe: `comfyui_auto` with `compatibility.ignoreWebsockets: true` + `checkEndpoint: /system_stats`, in the persistent `helpers` group). With standalone auto-start (TASK 1) there are now two deployment shapes with different VRAM/TTL semantics, and operators need the matrix spelled out. Also note: `docs/spec/integrations/image-generation.md` still files ComfyUI under 'Future' — stale since Path A ships in production.

## Implementation

1. `configs/config.llama-swap.example.yaml`: annotate the `comfyui_auto` entry with a mode header — proxy mode (this entry) vs standalone mode (TASK 1 spawner, no recipe entry needed, provider `baseUrl` direct). Add the tradeoff note: proxy shares VRAM/TTL accounting with LLM rotation groups (ComfyUI can be evicted / can block eviction — `ttl: 0` + `helpers` persistent membership required); standalone owns its GPU budget, never swapped, costs a second resident process.
2. `docs/spec/integrations/llm-serving.md`: extend the `/comfyui` Passthrough section with the standalone subsection (when to choose which; baseUrl shapes).
3. `docs/spec/integrations/image-generation.md`: promote ComfyUI Integration from 'Future' to first-class — Path A/B summary, workflow table (`txt2img`, `img2img`, + new sprite/matting templates from TASK 5), `client_id`/WS note.
4. Validate example YAML parses (js-yaml, same as the landed recipe ticket did).

**Acceptance Criteria:**

- [ ] Example recipe documents both modes + VRAM/TTL tradeoff
- [ ] llm-serving.md standalone subsection; image-generation.md ComfyUI promoted from Future
- [ ] YAML parses
- [ ] Documentation updated (this task IS docs)
