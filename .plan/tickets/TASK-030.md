<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-030: Character Creator Prerogative & Licensing

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Character creator picks license (ARR/CC-BY/CC-BY-SA/CC0/Custom); license stored + enforced.
**Context:** License selector in creator; export/share enforce attribution.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
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

Git issue: `16b8345`
