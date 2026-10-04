<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Caption route never sends image bytes to the model

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

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
