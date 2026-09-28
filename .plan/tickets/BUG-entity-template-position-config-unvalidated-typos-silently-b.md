<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: entity template position config unvalidated typos silently become after

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** templates.ts entityTemplatePosition (src/config/templates.ts:74-75) is not validated; any typo resolves to the default 'after' silently. Fix: validate against the allowed literal set at config load and warn on unknown values. Verify: bun test src/config/ template loader tests.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [x] Implementation complete
- [x] Tests passing
- [x] Verification command from ticket executed green

## Verification 2026-09-29 — closed

Validation now lives in `src/config/templates-loader/entity-position.ts` (the ticket
said `src/config/templates.ts:74-75`; the loader was split out since).

- `:10-13` `LEGAL_ENTITY_TEMPLATE_POSITIONS` is the closed set: `before`, `after`, `off`.
- `:31-34` a value in that set returns early (accepted).
- `:36-40` anything else emits a `TemplateConfigWarning` naming the legal values and
  the rejected one, then falls back to `DEFAULT_ENTITY_TEMPLATE_POSITION`.

So the silent-typo path this ticket describes is gone: an unknown value now warns
loudly instead of vanishing into `after`.

The ticket's own verification command passes: `bun test src/config/templates-loader/`
= **28 pass / 0 fail**, including a regression case for a `"befor"` typo.
