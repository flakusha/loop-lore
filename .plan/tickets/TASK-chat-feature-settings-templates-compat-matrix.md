<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Settings Templates + Compatibility Matrix Validation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

Provide reusable chat-settings templates that **must be created in advance** and be selectable on chat creation (or fall back to a CUSTOM option / empty base template). World- and location-enforced chat settings flow into the same template picker. Critically: validate every selection against a compatibility matrix because some settings are mutually exclusive — the request must be rejected (with a structured error) before any state mutation.

## Acceptance Criteria

- [ ] Templates live in `src/chat/service/templates.ts` and `template-crud.ts` and are addressable by id
- [ ] Templates must be created in advance (admin/owner flow) before they can be selected at chat creation
- [ ] A `CUSTOM` option and an empty/base template are always available as fallbacks
- [ ] Chat-creation flow surfaces a template picker with the matrix-validated subset
- [ ] World- and location-enforced chat settings appear as part of the same template selection (templates can carry world/location enforcement flags)
- [ ] Compatibility matrix axes include at minimum: ChatMode × ResponseStyle × NSFW gate × ChatType × RPG opt-in × Asset policy × World-enforced × Location-enforced
- [ ] Invalid combinations are rejected before any DB write with a structured 4xx response listing every offending axis
- [ ] The matrix is centrally defined and consumed by both the frontend (disabling options) and backend (validating requests)
- [ ] Existing templates pass the matrix unchanged

## Related Tickets / Epics

- epic-chat-product-features
- FEAT-chat-template-config-lifecycle
- FEAT-world-template-chat-lifecycle
- IDEA-chat-setup-templates
- TASK-prompt-template-per-chat-override-ux
- TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings
- TASK-fix-chat-setup-templates-visual-novel-remove-or-type-as-chat

## Files

- `src/chat/setup-templates.test.ts`
- `src/chat/service/templates.ts`
- `src/chat/service/template-crud.ts`
- `src/chat/service/template-defaults.ts`
- `src/chat/service/vn-choices.ts`
- `src/chat/types/config.ts`

## Open Questions

- Who owns the matrix — admin UI only, or is there a per-template allowed-modes list?
- Can a CUSTOM template override the matrix, or does it always inherit from base?

