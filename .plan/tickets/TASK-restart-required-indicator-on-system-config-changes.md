<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Restart-required indicator on system_config changes

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Mark which `system_config` keys require full server restart (socket rebind / middleware reregister / provider init / cron registration / dialect bind). Surface in:

1. **Backend** — add `REQUIRES_RESTART_KEYS: readonly string[]` constant in `src/admin/config.ts` listing the keys from `src/config/schema/{server,auth,generation,encryption,federation,db,assets,observability}.ts`. Include in `GET /api/admin/config-schema` response as `requires_restart_keys: string[]` (already mutated downstream in system-config.ts).
2. **Frontend — Admin System tab** — `src/frontend/alpine/admin-system.ts` reads `requires_restart_keys` from schema response, renders a dismissible red banner above the System tab table when ANY PATCH targets a restart-required key, persists `pending_restart_keys: Set<string>` per session, shows a 'Restart required' pill next to each restart-required row.
3. **Frontend — Settings page** — `src/views/settings.html` shows the same banner if a restart-required key is changed.
4. **Optional follow-on** (separate ticket): `POST /api/admin/restart` endpoint triggering graceful shutdown + spawn replacement. Out of scope here.

Reference: InstitutionalAardvark audit documented the restart-required key list (server.tls, server.port, db.url, generation.providers, etc.).

## Acceptance Criteria

- [ ] `REQUIRES_RESTART_KEYS` constant exported from `src/admin/config.ts`
- [ ] `GET /api/admin/config-schema` response includes `requires_restart_keys` array
- [ ] Admin System tab shows dismissible banner + per-row pill when restart-required key is PATCHed
- [ ] Settings page shows the same banner
- [ ] Banner clears after dismiss or after server restart signal
- [ ] Tests: constant covers all restart-required schema sections; banner renders for PATCH; pill rendering per row
- [ ] Documentation updated
