<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: alpha extraction matting job for opaque character images

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (already on dev, 2026-09-19)
**Priority:** high
**Epic:** Avatar Alpha Channel + VN Layering; Aux Enrichment Pipeline
**Effort:** Medium

## Summary

Implement the matting fallback from epic-avatar-alpha-vn-layering: aux-pipeline background-removal job (pluggable model/provider) producing a matted RGBA derivative asset linked to the raw (re-runnable when better models land); job status surface; has_alpha computation at store time; raw stays usable when matting fails. Complements provider-side transparency requests. Acceptance: job lifecycle tests (success/fail/re-run), asset pair linking, alpha detection tests (png rgba, webp vp8l), schema regen gates green.

## Resolution

Matting scaffold landed on dev by 2f9e64967 ("feat(assets): alpha extraction
matting pipeline with alpha_status status"); verified 2026-09-19 against
current dev (b8debaf99):

- `src/generation/matting/service.ts` — `MattingService` job lifecycle
  (eligibility → `matting_pending` → `matted`/`matting_failed`, re-runnable),
  derivative stored via `createAsset` and linked with `asset_links` label
  `matting-source`
- `src/generation/matting/{types,providers,job-store,auto-matte}.ts` —
  `MattingProvider` interface, HTTP provider, in-memory job store,
  `enqueueAutoMatting`
- `src/assets/service/alpha-status.ts` + `src/db/enums-content.ts` —
  `AssetAlphaStatus` state machine; `src/assets/service/delete.ts` —
  derivative GC + revert-to-raw
- `src/characters/services/emotion-avatar-service/generation.ts` —
  auto-enqueue wired (fires when a provider is passed)
- Lifecycle covered by `matting.test.ts` / `auto-matte.test.ts`
  (success/failure/re-run/ownership)

Remaining scope (real matting backends, provider construction from config,
HTTP trigger/status surface, matted-variant serving, VN render preference) is
absorbed by `FEAT-background.md` — close this ticket at bookkeeping.

No further code change required here.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
