<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Caption route never sends image bytes to the model

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] NEEDS-FIX-WITH-DETAILS (issue 42d6c17): Bytes now attached: caption-route.ts:138-146 reads image data (readCaptionImages) for vision-capable providers and :156 sets userMessage.images. Remaining: the ticket-required test does not exist — caption-route.test.ts:261-273 asserts only model + message roles, nothing asserts messages[].images carries the image.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-aux-enrichment-pipeline

**Summary:**

src/generation/caption-route.ts:129 builds the captioning request WITHOUT the image bytes - the captioning LLM never sees the image, so captions are inferred from metadata/alt-text (or silently wrong). Fix: attach the image bytes per the provider's vision contract and add a test asserting the payload contains the image for image-capable providers.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/generation/caption-route.ts:126-142 builds genReq with only text messages (system + user prompt naming the filename); asset bytes/base64 are never read or attached. All checked worktrees carry the identical text-only code at :127/:130.

**Resolved:** 2026-10-26 registry-driven close: git issue 42d6c17 (registry tip: ff7f6c0e0 Konstantin Fedotov Close issue)
