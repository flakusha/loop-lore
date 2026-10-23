<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: SAM3 direct provider via Meta Model API

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-sam3-segmentation-integration
**Tags:** segmentation, provider-registry
**Depends on:** `TASK-sam3-feasibility-probe-meta-model-api-vs-comfyui-custom-node`, `TASK-matting-concept-prompt-contract`
**Related:** epic-byok-api-keys.md, epic-byok-local-models.md (local-weights boundary), TASK-sam3-mask-cache-and-reuse.md

**Summary:**

Register SAM 3.1 (Meta Model API) as a direct image-provider entry, for installs without a ComfyUI backend (Path B1).

**Context:**

Contract comes from the probe ticket. The provider lands on the image-domain seams the codebase already uses — an `ImageProviderConfig` entry under `config.generation.providers.sd[]` selected with `pickSdProvider(providers, "edit")` (`src/config/schema/sd-provider.ts`, same as ComfyUI/sd-server), and for cutouts a `MattingProvider` (`src/generation/matting/providers.ts`) wired in `src/generation/matting/factory.ts`. **Do not** touch `src/generation/providers/registry.ts` — that registry is LLM-shaped (`registerProvider(name, LLMProvider)` + `GenerateRequest`, `callWithFailover`, circuit breaker) and image providers must not enter it. API key comes from the existing provider secret store — never plaintext config.

**Acceptance Criteria:**

- [ ] Config entry under `config.generation.providers.sd[]` with `purpose: "edit"` (resolved via `pickSdProvider`) or a `MattingProvider` branch in `src/generation/matting/factory.ts`; absent unless configured — default behavior unchanged
- [ ] If a new `ImageApiFamily` value is needed, it is added via the config-enum extension path (see `epic-config-extensions.md`); otherwise the entry reuses an existing family distinguished by endpoint — decision recorded in this ticket
- [ ] Client: image + concept prompt in; mask PNG out; upstream errors mapped to typed failures with no raw upstream text leaked into client responses
- [ ] Upstream `Retry-After` honored on 429; `timeout` / `generationTimeout` knobs from `ImageProviderConfig` honored
- [ ] Tests with a fixture server: happy path, 429 with `Retry-After`, malformed mask payload
- [ ] `bun run check` green

## Technical Notes

- Response mask encoding (PNG vs RLE/bitmap) is pinned by the probe ticket; decode + re-encode to PNG at the boundary.
- Local SAM 3 weights (Path B2) are out of scope — that runtime belongs to `epic-byok-local-models.md`.
