<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: SVG upload leads to stored XSS

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** high
**Effort:** Medium

## Summary

image/* prefix allows image/svg+xml; client file.type stored and echoed as Content-Type on serve, so SVG served inline executes. Fix: block scriptable MIME types; otherwise serve with Content-Disposition attachment and X-Content-Type-Options nosniff. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
