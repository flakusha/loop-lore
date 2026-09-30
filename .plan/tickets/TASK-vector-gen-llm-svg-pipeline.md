<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Vector Gen — LLM SVG Pipeline

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Generate SVG via existing LLM text path with validation + sanitized persist
**Epic:** epic-vector-graphics-generation
**Context:** See ## Summary, ## Change, and ## Edge Cases below.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Tags:** assets, vector, svg, generation

**Context:** Phase 1 of epic-vector-graphics-generation — the LLM-authored SVG path. Constraint: the mime allowlist in `src/assets/service/validate.ts` blocks raw `image/svg+xml` (stored-XSS hardening, see BUG-asset-serve-public-immutable-cache-inline-svg-exposure), so sanitized SVG must pass a new gate rather than bypass the existing one. Touched paths, change steps, and edge cases follow under Summary / Touched Paths / Change / Edge Cases.

## Summary

Add LLM-generated SVG vector path reusing existing LLM text completion path:
SVG prompt template → output parser/validator (well-formed XML, size caps) →
persist via `persistGeneratedImages`/`createAsset` behind new sanitized-SVG
mime gate. ComfyUI/SD raster engines untouched.

## Touched Paths

- `src/generation/image-gen-route.ts`
- `src/generation/image-engine/index.ts`
- `src/assets/service/persist-generated.ts`
- `src/assets/service/validate.ts`
- `src/generation/providers/registry.ts`

## Change

1. SVG prompt template on LLM text path (requests bare `<svg>...</svg>`,
   viewBox, no embedded raster, no prose wrapper).
2. Output parser/validator: extract `<svg>` block, well-formed XML parse,
   byte cap (e.g. 256 KiB), element/attribute budget; reject on failure.
3. Sanitizer policy before persist: strip `script`/`event-handler`
   attributes (`on*`), `foreignObject`, external refs (`href` to
   http/data/javascript); allowlist shapes/presentation attrs only.
4. New sanitized-SVG mime gate in `validate.ts` (keep raw `image/svg+xml` blocked per BUG-asset-serve-public-immutable-cache-inline-svg-exposure; allow only sanitizer-stamped SVG through `persistGeneratedImages`/`createAsset`). Note: `validateMimeType(mime: string)` takes only mime today — the stamp needs a separate gate in createAsset/persistGeneratedImages or a signature change; task implements whichever is smaller.
5. ComfyUI/SD/SDAPI providers untouched; no SD failover change.

## Edge Cases

- Model emits non-SVG prose / markdown fence: extraction fails → reject
  with retry (bounded retries, then user-visible error).
- `script` / `on*` / `foreignObject` / external refs present: strip per
  sanitizer policy; reject if nothing safe remains.
- Size bomb (oversized SVG / entity expansion / deep nesting): byte cap +
  parse budget → reject before persist.

**Acceptance Criteria:**

- [ ] Prompting "svg icon of a cat" returns stored asset servable via
  `/raw` with sanitized SVG mime, no `script`/`on*` in served bytes.
- [ ] Non-SVG model output surfaces retry-then-error, creates no asset row.
- [ ] Oversized SVG rejected before `createAsset`; no partial row/file.
- [ ] Raster flow (`generateImages` openai|sdapi|sdcpp|comfyui) unchanged.


git issue: 02cbb12
