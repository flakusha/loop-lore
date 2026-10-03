<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: isPluralNode duplicated in server and frontend i18n, diverging silently: a plural key renders as the raw key in the browser

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

On branch feat-i18n-plurals the plural-node discriminator exists TWICE, with identical logic but divergent handling downstream:

- server: `src/i18n/translator.ts:15-36` (PLURAL_CATEGORIES + isPluralNode)
- frontend: `src/frontend/i18n.ts:18-39` (same constant, byte-identical 3-line body)

The duplication of the constant set is structurally forced (separate tsconfig programs: tsconfig.backend.json vs tsconfig.frontend.json). But the LOGIC divergence is not, and it is not caught by any test because no shipped catalog contains a plural node (see TASK-010-plurals).

Verified against the branch (.tmp/flatten-divergence-probe.ts, .tmp/frontend-plural-probe.ts):

```
key              server                                                frontend
inventory.item   {"one":"{count} item","other":"{count} items"}     "{count} items"
```

- Server flatten (translator.ts:61) keeps the whole object as a leaf; `resolveKey` (translator.ts:109-116) then picks the CLDR category from `params.count`. Result: `t(count=1) -> "1 item"`, `t(count=7) -> "7 items"`.
- Frontend flatten (`src/frontend/i18n.ts:115`) collapses the node to `.other` unconditionally, so the count is discarded.
- Worse: the shipped frontend translator `t()` at `src/frontend/alpine/i18n.ts:28-33` calls `resolveKey` (`src/frontend/i18n.ts:70-90`) which returns `undefined` for ANY non-string leaf. Verified: frontend `resolveKey('inventory.item') = undefined`, so the browser renders the RAW KEY `inventory.item` for both count=1 and count=7.

So the moment the first real catalog key is migrated to a plural node, server-rendered views say "1 item" and the Alpine/htmx path renders the literal string "inventory.item". The duplication is the mechanism; the missing frontend plural resolution is the user-visible defect.

Fix: give the frontend the same count-aware resolution the server has (a frontend-local `resolvePlural` or an `other`-defaulting overload), and add a cross-assertion test that one fixture map produces identical flat keys AND identical selected variants through both paths. A comment cross-referencing the two files is the minimum if the logic stays duplicated.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
