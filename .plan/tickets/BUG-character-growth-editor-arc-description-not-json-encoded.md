<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Character growth editor arc description not JSON-encoded

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue ec7ebd3): Live render path src/routes/views/character-growth-section.ts:82-84 JSON-encodes via jsonStringifyOr + escapeAttr; regression-pinned by character-growth-section.test.ts:68. The raw {{.InitialArcDescription}} survives only in the dead partial src/views/partials/character-growth-editor.html:24 (no render sites in src).
**Priority:** medium
**Effort:** Medium
**Epic:** epic-character-growth

**Summary:**

initialArcDescription: {{.InitialArcDescription}} (src/views/partials/character-growth-editor.html:24) injects a Go string directly into a JavaScript expression without JSON encoding. If the description contains quotes, newlines, or special characters, the JavaScript breaks. Impact: Character growth editor fails to initialize if arc descriptions contain quotes or special characters. Fix: Use a JSON-encoded field like {{.InitialArcDescriptionJSON}} or use Go's js template function.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue ec7ebd3 (registry tip: c12ab07bc Konstantin Fedotov Close issue)
