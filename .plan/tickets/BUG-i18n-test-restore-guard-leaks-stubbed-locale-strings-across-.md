<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: i18n test restore guard leaks stubbed locale strings across worker

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:** i18n test restore guard leaks stubbed locale strings across 
**Context:** Context: 223285960/c41bbb186.
**Acceptance Criteria:** unconditional save/restore via sentinel boolean or import the shared i18n test helper.

## Summary

Context: 223285960/c41bbb186. Severity: nit. src/frontend/tests/i18n.test.ts:62 restores only when savedLocaleStrings !== undefined; when this file runs first in a worker nothing was saved, the nested beforeEach then snapshots its own stub, and {common,greeting} leaks to later files in the worker — order-dependent reintroduction of the DOM-pollution failure the isolation commits fixed (gif-picker.test.ts named as victim). Fix: unconditional save/restore via sentinel boolean or import the shared i18n test helper.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
