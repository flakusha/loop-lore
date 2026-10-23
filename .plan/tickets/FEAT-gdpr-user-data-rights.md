<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: GDPR & User Data Rights

**Status:** Done
**Priority:** high
**Effort:** Large
**Summary:** GDPR & User Data Rights
**Context:** Epic proposed:epic-gdpr-data-rights; tags gdpr, privacy.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** (none — proposed epic never materialized)
**Epic Note:** original value "proposed:epic-gdpr-data-rights" preserved 2026-10-23; no epic file exists.
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
