<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Vector-gen SVG serve safety

**Summary:** Sanitized-SVG allow path through the SVG block with hardened serve headers
**Context:** Vector-graphics epic; constrained by BUG-asset-serve-public-immutable-cache-inline-svg-exposure.md
**Acceptance Criteria:** See ## Acceptance Criteria below
**Epic:** epic-vector-graphics-generation

**Status:** Not Started
**Priority:** high
**Effort:** Medium

## Summary

Add sanitizer at `src/assets/service/sanitize-svg.ts` (new file; allowlist elements/attrs/CSS/schemes; strip script/on*/foreignObject/external refs) enforced at persist time; only sanitizer-passed SVG stored as servable kind, all else stays blocked. Add cacheControl branch in `serve-file.ts` (which today serves public-immutable always) for private/signed → private/no-store. Serve via `src/assets/serve-file.ts` with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`; unsanitized legacy bytes serve only as `Content-Disposition: attachment`.

## Acceptance Criteria

- [ ] Raw `image/svg+xml` upload with `<script>` still rejected or stored only as attachment-kind (upload probe SVG, no inline-served copy exists)
- [ ] Sanitizer-passed SVG serves inline with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff` present (curl `-I` raw URL, both headers observed)
- [ ] Unsanitized legacy SVG serves with `Content-Disposition: attachment` (curl `-I`, attachment observed, no inline execution)
- [ ] Public sanitized SVG keeps immutable cache; signed/private responses send private/no-store (curl `-I` both URLs, cache directives differ as stated)


git issue: c910362
