<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Image-edit /run crashes on missing params and the template registry is not hydrated or idempotent

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Five defects in the image-edit request and registry path.

1. handleRun never hydrates the registry. src/image-edit/routes.ts:74-92 calls templateRegistry.get() at :89 with no ensureWorkflowRegistry call; ensureWorkflowRegistry is imported at :15 but invoked only at :241 inside handleTemplates. A /run that arrives before any /templates request 404s on a DB-driven template.

2. handleRun crashes on a missing params object. src/image-edit/routes.ts:105-107 indexes body.params[p.name] inside the loop with no null guard; parseBody is a cast, not a validator, so a body without params raises TypeError: undefined is not an object.

3. Falsy values are treated as missing. src/image-edit/routes.ts:106 — if (p.required && !body.params[p.name]) rejects a legitimate 0 or empty string; the check should be === undefined.

4. registerBuiltinTemplates uses a module-scoped one-shot. src/image-edit/template-registry.ts:187,196 — let builtinTemplatesRegistered = false gates every later call regardless of which registry is passed; the registry argument is accepted and then ignored.

5. registerConfigWorkflows is not idempotent. src/image-edit/template-registry.ts:169-184 calls registry.register() per config entry on every load with no replaceManaged and no source tag, so a reload re-registers the same ids over stale state.

6. handleTemplates ignores category when backend is set. src/image-edit/routes.ts:142-148 — if (backend) ... else if (category) ...; when both are supplied the category filter is silently dropped.

Source: .tmp/longcat/review-misc-services.md M4, M8, i1, M7, i8, i9.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
