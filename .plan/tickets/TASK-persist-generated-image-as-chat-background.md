<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: persist generated image as chat background

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-immersion-presentation.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Generated scene or character images are not written back as chat backgrounds; the VN background_url field is never populated by any backend route. This is the cheap backend half of image-display gap IMG-4.

**Evidence (dev 2026-11-18):** report .tmp/intercom/plan-wave/05-image-display.md IMG-4; grep background_url over src/routes returns no matches; ImageGenBody at src/generation/image-gen-route.ts:37-66 has no background/scene target field; chat-backgrounds assignment routes are already shipped.

**Scope:** add an optional background target to the image generation result and call the existing chat-backgrounds assignment route to persist the generated asset; keep generation behavior unchanged when the target is absent; add one route test.

**Acceptance Criteria:**

- [x] generated image can be assigned as the active chat background
- [x] no new schema; existing asset ownership rules apply
- [x] default generation path unchanged

**Context:**

Shipped on branch `image-to-background`: optional background target in the image generation request calls the existing `setAssetAsChatBackground` helper after persistence. No schema change; default generation is unchanged when no target is sent. Route tests cover both the target and default paths; scoped coverage gate passes with `CHECK_TEST_JOBS=2` (default parallelism caused unrelated hook-timeout flakes).
