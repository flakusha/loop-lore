<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Invoke installed markuplint as a diff-scoped template gate

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

`.markuplintrc.json` is installed (`markuplint: ^5.0.1` + `@markuplint/html-spec` + `@markuplint/mustache-parser`) but no package script or canonical gate invokes it. The configured rules cover structural correctness (invalid-attr, etc.); activate them over `src/views/`, `src/components/`, `src/partials/` as a separate gate.

## Why

If the baseline is too large for full-project mode, run markuplint diff-scoped (only files changed on this branch). Track removal of the scope as the baseline is repaired. Do not leave an installed configuration described as "active coverage" while no command runs it.

## Where

- .markuplintrc.json
- package.json scripts (new `lint:markuplint` + diff-scoped variant)
- scripts/check-parallel.mjs (new gate, after template preflight)
- src/views/, src/components/, src/partials/ (target scope)

## Acceptance Criteria

- [ ] Controlled duplicate ID or orphan tag fails the new gate.
- [ ] Valid Alpine/htmx attributes remain accepted by the installed configuration.
- [ ] Canonical check output names the exact template scope.
- [ ] Diff-scoped mode runs only files changed vs `dev` on the branch.
- [ ] Clean tree passes the new gate.
