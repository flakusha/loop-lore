<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: GDPR & User Data Rights

**Status:** ✅ Done (duplicate — remainder extracted, 2026-09-19)
**Priority:** high
**Effort:** Large
**Summary:** GDPR & User Data Rights
**Context:** Epic proposed:epic-gdpr-data-rights; tags gdpr, privacy.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** proposed:epic-gdpr-data-rights
**Tags:** gdpr, privacy

## Summary

Implement full data export (JSON/ZIP), account deletion (soft->hard), data retention policies, privacy settings, data access audit log.
Source: docs/meta/admin-visibility-research.md.

## Resolution

Core scope tracked by src/routes/export.ts + telemetry-purge.ts + epic-chat-privacy.md. Unplanned remainder extracted 2026-09-19 → E14 account hard-delete flow + access audit log (epic-chat-privacy.md) (docs-gap reconcile audit).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
