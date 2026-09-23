<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Error monitoring — alert rules CRUD, webhook notifications, error grouping

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-analytics-observability
**Summary:** Add an error monitoring subsystem — alert rules CRUD, webhook outbound dispatch, and error grouping by message signature.
**Context:** gap-audit of `epic-analytics-observability` (E11) found no alert rules persistence, no webhook outbound service, and no error grouping; the original `FEAT-error-monitoring-alerting.md` was closed as duplicate on 2026-09-19 and the remainder extracted into E11.
**Acceptance Criteria:** Admin can CRUD alert rules via authenticated routes; webhook fires exactly when the configured threshold is exceeded; identical errors collapse into one bucket by message signature; new kysely migration adds the rules table.

## Summary

## What

Gap-audit E11 from .plan/epics/epic-analytics-observability.md: error monitoring subsystem is missing alert rules storage, webhook dispatch, and error grouping.

## Why

The original FEAT-error-monitoring-alerting.md was closed as a duplicate on 2026-09-19. The remainder was extracted into the docs-gap audit as bullet E11 in epic-analytics-observability.md. Today no alert rules are persisted, no webhook outbound service exists, and errors are not grouped by message signature.

## Scope

- New  table migration (kysely types + schema).
- Admin error monitoring routes: CRUD for alert rules (create, list, update, delete).
- Webhook outbound service that fires when error threshold is exceeded.
- Error grouping by message signature so duplicate floods collapse.

## Acceptance Criteria

- Admin can CRUD alert rules via authenticated routes.
- Webhook fires exactly when configured threshold is exceeded.
- Errors are grouped by message signature; repeated identical errors collapse into one bucket.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
