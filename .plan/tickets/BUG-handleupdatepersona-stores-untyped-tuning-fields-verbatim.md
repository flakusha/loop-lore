<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: handleUpdatePersona stores untyped tuning fields verbatim

**Status:** Done
**Priority:** Medium
**Effort:** Medium

**Summary:**

The create path guards its tuning fields with explicit typeof checks and returns 400; the update path has no such guards, so a string temperature is written straight into a REAL column and a non-numeric maxTokens or model string is stored as-is.

Evidence read on dev:

- src/personas/handlers.ts:150-164 — tuningUpdates copies body.temperature, body.maxTokens and body.model verbatim.
- src/personas/handlers.ts:91-93 — the same file's create handler does typeof body.temperature === 'number' checks and returns 400. The asymmetry is the defect.

Related coupling in the same module: src/personas/handlers.ts:168-170 and :232-234 map a service failure to 404 by comparing error.message === 'Persona not found'. That string is thrown only at src/characters/convert.ts:49; the lookup in service.ts returns undefined rather than throwing, so any other 404 shape is unmapped and the string is the only contract between the layers.

Source: .tmp/longcat/review-misc-services.md M9 and p1; .tmp/longcat/review-round2-consolidated.md misc nits.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-14 registry-driven close: git issue 698e0ff (registry tip: dd62fdee0 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-HANDLEUPDATEPERSONA-STORES-U)
