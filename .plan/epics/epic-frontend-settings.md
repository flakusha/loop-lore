<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Settings & Preferences UI

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Done
**Status Note:** `src/views/settings.html` ships tabs general, chat, api, notifications, data, keys and models, mounted via `settingsRoutes` from `src/routes/v1/base-surface.ts`
**Priority:** Medium

## Summary

Frontend implementation for Settings & Preferences UI. See `docs/frontend/settings.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/settings.md`

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Internationalization | Locale registry | Language preference |
| Admin Panel | Settings↔admin parity | System config sections |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Admin Panel | Preference model | Per-user prefs vs system config |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Settings markup (`src/views/settings.html`, `src/components/modals/settings.html`) | Admin, I18N | Shared settings surface |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Server-rendered settings form |

