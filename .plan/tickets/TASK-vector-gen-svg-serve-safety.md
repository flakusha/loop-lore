<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Vector-gen SVG serve safety

**Summary:** Sanitized-SVG allow path through the SVG block with hardened serve headers
**Context:** Vector-graphics epic; constrained by BUG-asset-serve-public-immutable-cache-inline-svg-exposure.md
**Acceptance Criteria:** See ## Acceptance Criteria below

**Status:** Not Started
**Priority:** high
**Effort:** Medium

## Summary

`BLOCKED_MIME_TYPES` in `src/assets/service/validate.ts` currently rejects
`image/svg+xml` outright (stored-XSS: SVG served inline executes — see
`.plan/tickets/BUG-asset-serve-public-immutable-cache-inline-svg-exposure.md`).
Define the sanitized-SVG allow path: new sanitizer in
`src/assets/service/sanitize-svg.ts` strips script/event-handler/
`foreignObject` content at persist time; only sanitizer-passed SVG is stored
as the sanitized kind, everything else stays blocked. Serve via
`src/assets/serve-file.ts` with `Content-Security-Policy: sandbox` and
`X-Content-Type-Options: nosniff`; unsanitized legacy bytes serve only as
`Content-Disposition: attachment`. Immutable cache headers kept for public
assets; private/signed responses keep private/no-store per the BUG ticket.

## Acceptance Criteria

- [ ] Raw `image/svg+xml` upload with `<script>` still rejected or stored only as attachment-kind (upload probe SVG, no inline-served copy exists)
- [ ] Sanitizer-passed SVG serves inline with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff` present (curl `-I` raw URL, both headers observed)
- [ ] Unsanitized legacy SVG serves with `Content-Disposition: attachment` (curl `-I`, attachment observed, no inline execution)
- [ ] Public sanitized SVG keeps immutable cache; signed/private responses send private/no-store (curl `-I` both URLs, cache directives differ as stated)
