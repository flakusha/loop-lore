<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Remove unused bun-plugin-html dependency

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-code-quality.md
**Tags:** build, dependencies, cleanup, html
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Remove the unused `bun-plugin-html` dependency from the manifest and lockfile.

**Evidence (file:line)**

- `package.json:213` lists `bun-plugin-html`; `knip.json:86` reports it as not registered as a Bun plugin.
- No second HTML pipeline exists to keep in sync: the shipped HTML paths are the build minifier (`src/build/compress.ts:150-167`), the runtime response minifier (`src/middleware/dynamic-response.ts:89-119`) and the asset copy (`src/content/compress.ts:95`), all using `src/content/minify.ts:8-20` (`.tmp/research/html-stripping-patterns.md` §1).
- Classified as a Nit in `html-stripping-patterns.md` §5 severity list.

**Why deferred (low priority)**
Pure hygiene: no runtime or gate benefit. Requires a manifest + `bun.lock` change plus a full check run, which is disproportionate to deleting one unused entry, so it was kept out of the two HTML fixes.

**Acceptance criteria**

- [x] `bun-plugin-html` removed from `package.json` and `bun.lock`.
- [x] No source, config or test references it (grep repo-wide).
- [x] Install from the updated lockfile succeeds and `bun run check` is green (no new failures).
- [x] Build output (`bun run build:frontend`) is unchanged for a representative HTML template.

**Verification command for the implementer**
`bun install --frozen-lockfile`, `bun run check`, `bun run build:frontend`.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
**Resolved:** 2026-11-18T10:14:23.087Z Implemented on dev: a0057c6aa743b7c39c2604faf153588738e8a5ba (parity gate, minifier notes, runtime policy test, i18n fix) and f6d78d2bb64b07c5d7b36353380a25f1a9c2016e (bun-plugin-html removal).
