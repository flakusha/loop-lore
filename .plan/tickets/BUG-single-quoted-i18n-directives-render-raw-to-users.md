<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Single-quoted i18n directives render raw to users

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-i18n.md
**Tags:** i18n, templates, frontend
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

47 single-quoted `{{{t('key')}}}` directives (28 distinct keys) are never substituted at render time and show literal raw directive text to users.

**Evidence (file:line)**

- `I18N_TEMPLATE_RE = /\{\{\{\s*t\("([^"]+)"\)\s*\}\}\}/g` at `src/routes/views/constants.ts:15` matches ONLY double-quoted inner `t("key")`; applied by `applyI18n` at `src/routes/views/layout.ts:206-209`. Single-quoted inner `t('key')` forms fall through untouched and render literally.
- Concrete examples: `src/views/admin.html:10` and `src/views/blog.html:6` and `src/views/characters.html:6` (`aria-label="{{{t('accessibility.toggleSidebar')}}}"`); `src/components/chat/chat-header.html:9` (same key); `src/components/world-lore-panel.html:20` (`aria-label="{{{ t('worlds.loreNewEntry') }}}"`); `src/partials/worlds/create-wizard.html:24` (`aria-label="{{{ t('common.close') }}}"`).
- Count re-measured 2026-11-18 (`.tmp/research/html-single-quote-count.ts`; see `.tmp/research/html-deferred-ticket-audit.md` §5): 47 occurrences / 28 distinct keys, pre-existing. The older `.tmp/research/html-parse-failure-triage.md` §3 figure of 46 / 27 is stale; scratch reports are kept as historical evidence and were not edited.
- NOT caused by `8c8cd7a8f`: that commit changed only the OUTER attribute delimiter (`title="{{{t("key")}}}"` -> `title='{{{t("key")}}}'`) on 33 attribute-position sites, leaving inner `t("key")` double-quoted and matching the regex. The single-quoted-inner defect predates it.
- Test precedent: `src/regex/template.edge.test.ts:120` already asserts `i18n("{{{t('single')}}}",)` returns null (unmatched) — encoded as expected behaviour today.

**Why deferred (low priority)**
User-visible but cosmetic: affected strings are aria-labels, placeholders and tooltips that display raw `{{{t('key')}}}` text instead of the translation. No crash, no data loss, pre-existing.

**Acceptance criteria**

- [ ] `applyI18n` substitutes single-quoted inner `t('key')` directives as well as double-quoted `t("key")`, with and without surrounding whitespace.
- [ ] The 28 distinct keys resolve to their translated values (no raw `{{{t(...)}}}` left in rendered HTML for the affected pages).
- [ ] Existing `|| "Fallback"` text-position forms (e.g. `src/views/settings.html:114`, `src/components/security/sessions-panel.html:10,12,18,41,49,58`) keep working — the change must not swallow a fallback into the key.
- [ ] `src/regex/template.edge.test.ts:120` updated to assert the new substitution, plus a targeted test for one of the file:line examples above.

**Verification command for the implementer**
`bun test src/routes/i18n.test.ts src/routes/views.test.ts src/regex/template.edge.test.ts`, `bun run i18n:keys`, `bun run scripts/check-frontend-templates.ts`, and a rendered-HTML grep for raw `{{{t('` directives.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
