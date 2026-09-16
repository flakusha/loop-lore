<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Single source of truth for config schema mirrors

**Status:** ✅ Done (2026-09-16, tree/admin-config-impl)
**Priority:** medium
**Effort:** Medium

## Summary

D3, decision 2026-09-03: mirrored structures MUST be derived from one source of truth. config/schema-class/json-schema/generation.ts vs config/sections/generation/{sd,llama}.ts (409t/54l, 342t/37l; ~5.5k tokens, ~6 files). Reuse the DB-schema codegen pattern (migrations -> generated artifacts). Epic/task promotion candidate per user. Before starting, verify no other session still owns config/schema-class/json-schema/* (a finalize stash previously touched these files; stash state changed since triage).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

18 schema-class defaults files → re-exports of `sections/*` (sections canonical).
15 json-schema mirrors → re-exports of section `*Meta` (incl. headersMeta rewrite:
defaults-sourced + hsts added; loggingMeta kept default-free honest).
DATA_DIR placeholder moved to json-schema/index.ts assembly boundary.
Behavior deltas now live: AUTH_JWTSECRET/CSRFSECRET/JWTEXPIRESIN/LEGACYOPAQUE
- `SERVER_TRUSTPROXY` env keys; nsfw.useLlmClassifier false→true; encryption.anonymous;
generation chatDefaults replaces stale regexTransforms literal; sessionToken + jwt/auth
keys + travelPrompts surfaced in published schema. schemas/* regenerated, 29 schema tests green.
