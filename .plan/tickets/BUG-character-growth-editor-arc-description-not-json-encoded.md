<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Character growth editor arc description not JSON-encoded

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

initialArcDescription: {{.InitialArcDescription}} (src/views/partials/character-growth-editor.html:24) injects a Go string directly into a JavaScript expression without JSON encoding. If the description contains quotes, newlines, or special characters, the JavaScript breaks. Impact: Character growth editor fails to initialize if arc descriptions contain quotes or special characters. Fix: Use a JSON-encoded field like {{.InitialArcDescriptionJSON}} or use Go's js template function.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
