<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system announcements (instance-wide banners)

**Status:** Not Started
**Summary:** Admin CRUD for instance-wide announcement banners (severity, dismissibility, active window).
**Context:** OpenWebUI `admin/Settings/Interface/Banners.svelte` + `Events.svelte`; loop-lore banners are transient UI patterns only, no admin-authored announcements (2026-09-21 refs audit).
**Acceptance Criteria:**
- [ ] Admin creates announcement → users see banner on next page load
- [ ] Dismissal persists per user; expired window stops rendering without redeploy
- [ ] Critical non-dismissible variant renders for maintenance notices
**Epic:** epic-frontend-admin.md
**Type:** Feature | **Priority:** Low | **Effort:** S

## Problem

OpenWebUI ships system-wide announcement banners plus a configurable events surface (`src/lib/components/admin/Settings/Interface/Banners.svelte`, `admin/Settings/Events.svelte`). Loop-lore's admin panel (12 tabs shipped) has no instance-to-user announcement mechanism: searches `announcement|banner` across `.plan/` + `docs/` surface only transient UI banners (error/retry, restart-required, migrated-from) — none are admin-authored user-facing announcements (verified 2026-09-21 reference-platform gap audit).

## Change

- Admin CRUD for announcements: message (i18n-ready), severity (info/warning/critical), optional dismissibility, optional active window (from/until).
- Render via the existing banner component pattern (`docs/frontend/components.md` top-of-content banner, 150ms slide) on authenticated pages; critical/non-dismissible variant for maintenance notices.
- Stored in DB (admin config domain); counts toward `requires_restart_keys` discipline only if cached at boot — prefer live fetch.

## Acceptance

- Admin creates → users see banner on next page load; dismiss persists per user.
- Expired window stops rendering without redeploy.

## Non-goals

- Per-world GM notices (world chat channels already cover); email/push delivery (notifications epic).
