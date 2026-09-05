<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: callAux graceful failure throws on empty config

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

resolveModelRole crashes (runner.ts:65) before null-check; expected graceful null; actual exception.

## Resolution

`resolveModelRole` (`src/admin/model-roles.ts`) now guards a missing/partial
`config.generation` section and returns an empty role (`{ provider: "", model: "", source: "default" }`)
instead of throwing a TypeError on `config.generation.modelRoles?.[...]`.
`callAux` (`src/aux-pipeline/runner.ts:65`) already treats empty provider/model
as a graceful `null` return. Regression test added at
`src/aux-pipeline/aux-pipeline.test.ts` ("returns null when no model role is
resolved") passing an empty `config` (`{}`) and asserting `null`.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
