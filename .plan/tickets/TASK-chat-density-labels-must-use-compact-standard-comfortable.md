<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat density labels must use compact, standard, and comfortable

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend
**Caveats:** accessibility, partial failure, stale state, localization, observability

**Context:**

Chat density should use the verified MUI labels while preserving stored values through aliases.

**Summary:**

Chat density should use the verified MUI convention—`compact`, `standard`, and `comfortable`—rather than inventing incompatible labels.

**Evidence:**

- `https://mui.com/x/react-chat/basics/variants-and-density/`
- Existing stored values and narrowing behavior cited in `.tmp/research/tomorrow-followups-2026-11-21.md`.

**Scope:**

- Introduce the three verified density labels.
- Preserve old values through a read-time alias table.
- Update all affected locales.
- Keep layout variant and density independent.

**Acceptance Criteria:**

- [ ] The three verified labels are supported.

git issue: b41d234

- [ ] Existing stored values continue to work through aliases.
- [ ] Locale coverage is complete.
- [ ] Variant and density remain independent settings.
- [ ] Relevant frontend tests pass.
