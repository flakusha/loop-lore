<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Internationalization (i18n)

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Internationalization (i18n). See `docs/frontend/internationalization.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/internationalization.md`

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Frontend Components | Server-rendered partials | Post-swap translation hydration (see `matrix-frontend-backend-integration.md` FB6) |
| HTML Dedup & HTMX Reuse | htmx swap lifecycle | Hydrate after `Alpine.initTree()` |
| Frontend Settings | Locale preference | Where locale is chosen (see FB8) |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Settings, Components, Views | Translated strings | UI text |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `src/frontend/i18n.ts` + `src/i18n/translator.ts` | All views/partials | Translation lookup + locale |
| `src/frontend/locale-init.ts` | Settings | Locale bootstrap |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| htmx `afterSwap` | subscribes | Re-hydrate `data-i18n` nodes |

