<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Browser e2e suite flakes under concurrent runs

**Summary:** The 'e2e - browser (baseline)' gate fails intermittently with a rotating set of files - resource contention in the browser harness, not a code regression.
**Context:** Three full gate runs on comfyui-first-class-citizen gave a rotating failure set; every failing file passes in isolation, and the concurrent log is peppered with '[ERROR] [async-store] async-store write failed'.
**Acceptance Criteria:** The 34 browser files' resource allocation is audited and the shared, unbounded resource (port, temp dir, server handle, or browser context) is made safe, so the gate can be trusted to gate a merge.
**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

The 'e2e - browser (baseline)' gate fails intermittently with a rotating set of files, while other files in the same run pass. It is resource contention in the browser harness, not a code regression.

Evidence from one session on comfyui-first-class-citizen, three full gate runs:

- run 1: access-correctness.browser.ts failed
- run 2: docs-mermaid failed
- run 3: 2/34 files failed - i18n-locale.browser.ts and navigation.browser.ts
  - in that same run access-correctness passed 10/0

Every file that failed passes in isolation. i18n-locale + navigation run alone: 15 pass, 0 fail.

The log is peppered with '[ERROR] [async-store] async-store write failed' throughout the concurrent run, which points at a genuine resource failure rather than a test assertion.

Likely cause: the suite runs files concurrently and something is shared and unbounded - a port, a temp dir, a server handle, or a browser context. Needs an audit of the 34 browser files' resource allocation.

Impact: the gate is not trustworthy - a green run and a red run can both be correct, so it cannot gate a merge on its own.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
