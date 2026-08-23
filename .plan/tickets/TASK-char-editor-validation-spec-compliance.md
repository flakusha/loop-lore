<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-char-editor-validation-spec-compliance

**Status**: open
**Priority**: high
**Labels**: frontend, validation, character-editor, schema
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `docs/spec/character-spec.md` §5.1, §7, `src/validation/schemas/`, `src/characters/spec/`

## Description

The character spec defines validation rules that have no frontend or API
enforcement:

1. **Field constraints**: lengths (name ≤64, description ≤5000, etc.), array limits (≤10 alternate greetings, ≤20 tags)
2. **Content rating propagation**: characters with `nsfw_extreme` can't be used in `sfw` worlds
3. **World/style validation rules**: world-specific `allowed_content_ratings`, `forbidden_tags`, `required_fields`
4. **Two validation modes**: strict vs relaxed (configured per server)
5. **Review workflow**: draft → pending_review → approved | rejected → archived
6. **Impersonation rules**: one character per user in private chats, GM override

None of these are implemented in the frontend validation layer.

### Acceptance Criteria

- [ ] Client-side validation for all field constraints (length, count, format)
- [ ] Validation runs on field blur (instant feedback) AND on form submit
- [ ] Error messages reference spec: "Name must be 1-64 characters (spec §1.1)"
- [ ] World-style validation: on character save, validate against world rules if world_id set
- [ ] Content rating validation: warn when character rating exceeds world allowed ratings
- [ ] Server-side validation endpoint: `POST /api/characters/validate` (validates without saving)
- [ ] `X-Validation-Mode: relaxed` header supported — relaxed mode logs warnings, doesn't block
- [ ] Validation errors rendered inline below each field (red border + message)
- [ ] Field-level error summary in Review tab
- [ ] Review workflow: submit button, status badge, review log display
- [ ] Impersonation conflict detection: warn when user already impersonating in another chat
- [ ] Unit test: all constraint violations, mode switching, world-style rule enforcement

### Notes

- Use Elysia `t` (TypeBox) schemas in `src/validation/schemas/` for server-side validation
- Client-side validation mirrors server rules — DRY via shared constraint constants
- Validation endpoint returns structured errors: `{ errors: [{ field, code, message, specRef }] }`
- Relaxed mode is server-config — frontend respects it via response header
- Review workflow state machine already specified in `docs/spec/character-spec.md` §5.4
