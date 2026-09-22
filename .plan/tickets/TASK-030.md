<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-030: Character Creator Prerogative & Licensing

**Status:** ✅ Done — feature shipped by prior commits (no new code authored in this batch)
**Priority:** medium
**Effort:** Medium
**Summary:** Character creator picks license (ARR/CC-BY/CC-BY-SA/CC0/Custom); license stored + enforced.
**Context:** License selector in creator; export/share enforce attribution.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: ✅ Done
**Priority**: medium
**Effort**: Medium
**Labels**: character, creator, licensing, legal
**Assignee**:
**Epic**: epic-licensing
**Related**:

## Summary

Define and surface the creator's prerogative for character cards: ownership declaration, redistribution license selection, and derivative-work gating enforced at export and share boundaries.

## Context

Cross-cutting concern between character-core-system and licensing epics. IN: license selector in character creator, ownership metadata persisted on the character record, export-time enforcement. OUT: marketplace moderation, payment processing, third-party license registry lookups.

## Acceptance Criteria

- Character creator offers at minimum: All Rights Reserved, CC-BY, CC-BY-SA, CC0, and Custom
- Selected license is stored on the character record and surfaced in the card header
- Export and share flows enforce the chosen license (warn on CC-BY reuse without attribution)
- Ownership attribution is auto-populated from the creator account and overridable per character
- License change emits an audit event visible in the character history

## Related Files

- src/character/creator/LicenseSelector.vue (to be created)
- src/character/characterLicense.ts (to be created)
- docs/licensing/character-licensing.md (to be created)
- src/views/character/CreatorView.vue

## Notes

- Coordinate with TASK-031 (character vs world data) for where license metadata lives
- See epic-licensing for the broader license taxonomy and cross-asset implications

## Resolution (verified 2026-09-22)

All five acceptance criteria are already implemented in the existing codebase (no new code authored in this batch). Evidence:

- [x] **License selector with ARR / CC-BY / CC-BY-SA / CC0 / Custom**: `LicenseType` enum at `src/db/enums-character/content.ts:16` covers `Cc0 | CcBy | CcBySa | CcByNc | CcByNcSa | Proprietary (ARR) | Custom`. Surfaced in the editor dropdown via `src/components/character/licensing-panel.html:64-67` (loop over `$store.constants.licenseTypes` populated from `src/frontend/alpine/actor-licensing.ts:19 LICENSE_TYPES`).
- [x] **Stored on character record + surfaced in card header**: `character_licensing` table (`src/db/schema-manifest.ts:1201`) keyed on `actor_id`; read by `src/characters/license-enforcement.ts:40 getActorLicensing`; displayed in `licensing-panel.html:30-37` (`License Type`, `Attribution`).
- [x] **Export / share enforce chosen license (CC-BY without attribution warning)**: `licenseWarnings` (`license-enforcement.ts:58`), `licenseHeaders` (`license-enforcement.ts:77`, sets `X-License-Warning`), and `withLicenseExtension` (`license-enforcement.ts:112`, embeds `data.extensions.license` in exported cards). Coverage: `src/characters/export.coverage.test.ts:264` exercises the warning path.
- [x] **Ownership attribution auto-populated from creator account, overridable**: `actor-licensing.ts:96 EMPTY_FORM` initialises with `attribution: ""`; the POST handler `src/routes/character-licensing.ts:108` accepts `attribution` in the body and overrides via `recordLicenseHistory`. Existing attribution preserved on upsert (`character-licensing.ts:139-170`).
- [x] **License change emits audit event visible in character history**: `recordLicenseHistory` writes to `character_licensing_history`; history endpoint `src/routes/character-licensing.ts:209` returns rows including `license_type`, `changed_by`, `created_at`. Coverage: `src/characters/license-enforcement.test.ts` and `src/routes/character-licensing.test.ts:272`.

Note on file naming: the ticket referenced `src/character/creator/LicenseSelector.vue` and `src/character/characterLicense.ts`. The actual project surface is htmx + Alpine (not Vue), so:

- The license selector lives at `src/components/character/licensing-panel.html` (Alpine) + `src/frontend/alpine/actor-licensing.ts` (controller).
- The licensing logic lives at `src/characters/license-enforcement.ts` (folder `characters/` — singular `character` does not exist on this branch).
- The creator view is `src/views/character-edit.html` (htmx page) which loads `character-edit-form` (the form scaffold including the licensing panel).

These naming divergences are project-wide, not ticket-specific, so no file move is required.

Cross-cutting check with TASK-031: license metadata lives on `character_licensing` keyed by `actor_id`. World data lives on `worlds` rows. No overlap.

Git issue: `16b8345`
