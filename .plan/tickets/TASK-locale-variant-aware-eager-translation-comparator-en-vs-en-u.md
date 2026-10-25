<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: locale-variant-aware eager-translation comparator (en vs en-US)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Eager-translation comparator is exact-string; `en` vs `en-US` triggers a wasted MT round-trip that can only degrade the original text.

**Files:**

- src/chat/translation-target.ts:229-234

**Evidence:**

- `shouldTriggerEagerTranslation` returns `displayLocale !== nativeLocale`. `normalizeBcp47Tag` canonicalizes case but never collapses region variants, so display `en-US` vs model-native `en` (defaults say `DEFAULT_NATIVE_LOCALE = "en"`, line 43) fires an eager provider call and stores an en→en-US machine-translated variant. Same-shape locales (`zh-Hans` vs `zh`) behave likewise (review-core.md F-8).

**Fix:**

Make the comparator locale-variant-aware: collapse region/script variants to the base language for the equivalence check (e.g. compare primary language subtags, or treat base-language match as "same locale"), so `en` vs `en-US` and `zh` vs `zh-Hans` do not trigger eager translation.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-core.md F-8.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
