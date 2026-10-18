<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Translator model role with general-model fallback

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** aux-enrichment-pipeline

**Summary:**

Adds a third-class `translator` model role alongside `general` and `auxiliary`, defaulting to the general model.

Scope:

- Config: `LLM_TRANSLATOR_PROVIDER` / `LLM_TRANSLATOR_MODEL` env vars, `generation.modelRoles.translator` config key, admin panel entry via VALID_ROLES.
- Resolution: one seam (`resolveTranslatorRole`) owning the translator -> general fallback; no parallel provider system.
- Consumption: /translate, /tl, and per-chat auto-translate route through the translator role.
- Fallback rule: unset (or missing provider/model) resolves to the general model via the `main` role, so a `main` DB override is honoured.

**Caveats:**

- TOCTOU: none - single read-then-resolve per call, no caching.
- security: no new credential surface; resolution reuses resolveProvider BYO key chain.
- authorization: admin assignment goes through the existing model-roles route permission gate.
- parallelism: none - no shared mutable state; role resolution is pure reads.
- lock/unlock lifecycle: n/a - no locks acquired.
- partial failure: a translator naming an unregistered provider degrades to untranslated text (warn log), never a silent model swap.
- rollback: remove the VALID_ROLES entry and the role resolver; callers revert to resolveProvider.
- stale state: DB overrides are read per call, so a cleared override takes effect immediately.
- data races: none - no shared writes introduced.
- idempotency: role resolution is read-only and idempotent.
- observability: warn log on unresolvable translator provider.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
