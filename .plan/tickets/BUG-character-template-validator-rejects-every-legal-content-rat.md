<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Character template validator rejects every legal content_rating

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 0096d4e): src/config/templates-loader/validation-domains.ts:8,18 now imports VALID_CONTENT_RATINGS from characters/validator/constants as the single source; regression coverage over all four nsfw ratings at templates-loader.test.ts:526.
**Priority:** high
**Effort:** Medium
**Epic:** epic-config-templates

**Summary:**

LEGAL_CONTENT_RATINGS in src/config/templates-loader/validation-domains.ts hardcoded a legacy sfw|questionable|explicit set, while CharacterTemplateConfig (src/config/sections/templates.ts:205), sections/characters/section.ts:78, schema-class/json-schema/templates.ts:168, and VALID_CONTENT_RATINGS (src/characters/validator/constants.ts:47) all declare sfw|nsfw_mild|nsfw_moderate|nsfw_intense|nsfw_extreme.

Because validateCharacterConfig is on the load path (src/config/templates-loader/index.ts:116), any character template setting content_rating to nsfw_mild or any other non-sfw legal value threw TypeError at load. sfw was the only rating that passed. Conversely questionable and explicit - values the type does not allow - passed validation.

Fixed by importing VALID_CONTENT_RATINGS instead of a local literal, so the vocabulary has one source. Regression tests cover all four legal nsfw ratings and both retired values.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 0096d4e (registry tip: 628c42e68 Konstantin Fedotov Close issue)
