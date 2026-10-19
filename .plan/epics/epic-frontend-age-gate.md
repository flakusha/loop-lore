<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Age Gate & Content Warnings

**Effort:** Medium
**Type:** epic
**Tags:** frontend, security, privacy
**Overview:** (see sections below)


**Status:** Done
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Age Gate & Content Warnings. See `docs/frontend/age-gate.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/age-gate.md`

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Login & Authentication UI | Entry flow | Age verification ordering |
| NSFW Gate middleware | Content gating | `src/middleware/nsfw-gate/index.ts` |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Login & Authentication UI | Verification result | Gate the session |
| Frontend Settings | Preference | Age/content-warning prefs |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Age-gate service (`src/age-gate/service.ts`) | Login, NSFW gate | Verification state |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Server-rendered verification page |

**Resolved:** 2026-10-19 registry-driven close: git issue c38ad66 (registry tip: 375d430f5 Konstantin Fedotov Auto-closed: appended .md marker marks EPIC-FRONTEND-AGE-GATE done)
