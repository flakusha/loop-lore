<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: gm-tool AUX task has no production consumer - wire or remove

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

detectGmTool (src/assistant/gm-tool-detection.ts, callAux gm-tool at :118) is implemented and tested but no route or command consumes its result, unlike intent which at least gates short-reply. Either wire the detection result into the GM tool execution flow (sibling of TASK-wire-intent-output-to-workflow-runner-startworkflow) or remove the dead AUX task and its telemetry surface.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-04 registry-driven close: git issue ecde333 (registry tip: 8486963a6 Konstantin Fedotov Close issue)
