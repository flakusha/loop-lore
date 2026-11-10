<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Auto-generate docs/reference/api.md from OpenAPI spec

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Epic:** epic-openapi-reference
**Priority:** Medium
**Effort:** Medium

## Summary

docs/reference/api.md (674 lines, hand-maintained) drifts from the real routes. Now that bun run openapi generates docs/reference/openapi.json, render api.md from the spec. Acceptance: new script (extend scripts/generate-openapi.ts or add scripts/generate-api-md.ts) writes api.md endpoint table (method, path, summary) with DO NOT EDIT banner; hand-written sections move to a separate companion file or clearly delimited region; check gate fails on stale api.md (regen + git diff --exit-code). Keep v1/v2 surfaces separable when v2 lands.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Evidence (2026-11-10, measured on branch `release-010-closeout`)

The machine-readable contract is ALREADY generated and served - `bun run openapi` boots the live
Elysia app and writes `docs/reference/openapi.json` (gitignored, 746 paths / 986 operations), and
the server serves it at `GET /api/v1/openapi/json` (+ Scalar UI at `/api/v1/openapi`). The
hand-maintained part is only `docs/reference/api.md`, policed today by the blocking `api - doc drift`
gate (157 documented operations; 117/721 v1 spec paths; ratchet baseline 108 - coverage may only
grow; the gate is green).

Prerequisite, measured: of the 986 operations in the generated spec, 618 carry the route `detail`
metadata a generated table renders (summary + tags; 554 carry a description). `api.md` hand-documents
157 operations today. A generated table would therefore be substantive for ~63% of the surface and
hollow for the remaining ~368 operations - those routes need doc comments on their `detail` block
before the generator has something to print (the same prerequisite the frontend Typedoc ticket
states for `src/frontend/alpine/**`).

With a generated table the `api - doc drift` gate changes role: it stops comparing coverage and
becomes a freshness check (regenerate + `git diff --exit-code`), which is what this ticket's
acceptance already asks for.

One gap to close in the same pass: `docs:build` (`giwt plan sync-docs && bun scripts/build/split-plan-gen.ts &&
bunx vitepress build docs`) does NOT run `bun run openapi`, and `docs/reference/openapi.json` is
gitignored - a fresh clone's docs build has no spec file to embed, so the generated pages need the
generation step wired into the build. `scripts/generate-openapi.ts` boots the whole app, so that
wiring is a build-cost decision (and belongs here, not on a release branch).

Sibling proposals, not duplicated here: `FEAT-generated-frontend-reference-docs-typedoc-to-vitepress.md`
(the frontend surface), `TASK-build-time-openapi-export-scripts-gen-openapi-ts-gen-api-doc.md` (the
older build-time export chain).
