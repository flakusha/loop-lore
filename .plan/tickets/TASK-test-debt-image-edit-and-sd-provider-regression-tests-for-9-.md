<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: test debt: image-edit and SD provider regression tests for 9 fixes

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-testing-qa
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Nine image-edit/SD fixes land unpinned; routes.coverage/templates.coverage/ops tests pass on dev. Fixes map to BUG-IMAGE-EDIT-RUN-CRASHES (57b50f5, Not Started). Includes untested silent .catch(() => 0) at routes.ts:90 (banned pattern: add warn log while writing the test).

Specs:

1. routes.coverage.test.ts: templates with backend+category set asserts every returned template satisfies both (category silently ignored before).
2. template-registry: registerConfigWorkflows twice with differing configs asserts listAll contains only the second slice.
3. builtin templates: registerBuiltinTemplates() twice asserts singleton size equals builtinTemplates.length (new template-registry.test.ts or routes.coverage).
4. run-params: POST valid template+backend (comfyui, stubbed provider) with no params expects the 400 missing-required-param envelope, not a 500 TypeError; add getChildLogger warn on registry-seed failure instead of .catch(() => 0).
5. inpaint: assert inpaint.backends equals [comfyui].
6. comfyui-owner.test.ts: stub waitForCompletion returning OUT.PNG, assert createAsset received image/png.
7. templates.coverage.test.ts: parseLoraString('good:0.5,,bad:xyz') asserts one warn mentioning bad:xyz.
8. sd-server ops.test.ts: executeImg2Img with params.emotion happy and stubbed generate seam asserts prompt contains happy expression.
9. sd-server index: stub loadConfig with/without sdCpp.controlNetPath asserts capability flags.

Evidence: minimal-a + minimal-b per-branch findings (20/20/23/3/15/30 pass respectively).

Acceptance Criteria:

- [ ] each spec added and failing-before verified
- [ ] no silent .catch remains at routes.ts:90
- [ ] scoped image-edit suites green

Reports: .tmp/glm-review/2026-10-21/minimal-a.md, minimal-b.md.

Caveats: test-only plus one log line; stub external providers in tests; no auth change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
