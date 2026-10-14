<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(plugins): make plugin discovery failures visible

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** plugin-system

**Summary:**

Sources: stream-b #7. Where: src/plugins/loader.ts:149-150 (missing plugin.ts silent return), :158-161 (invalid manifest warn+return), :193 (error: String(error), no stack), :354-359 (onUnload swallow). Gap: a plugin directory without plugin.ts returns silently, an invalid manifest only warns, load errors drop the stack, and onUnload failures vanish - typos and broken teardowns disappear from boot logs while shutdown stays best-effort. Acceptance: skipped directories/invalid manifests log at warn with names; load errors log with stack/cause; onUnload failures are emitted (shutdown remains best-effort). Priority: low - boot-log observability; no runtime behavior change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
