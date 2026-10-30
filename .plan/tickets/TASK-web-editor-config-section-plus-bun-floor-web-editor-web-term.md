<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: config section plus Bun floor (web.editor/web.terminal)

**Status:** Done
**Scope:** Browser-side terminal EDITOR support epic (S1 config, S2 URI links, S3 PTY route, S4 sandbox tree)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. Register web.editor (default vscode) plus web.terminal.enabled/allowRemote via 4-point config pattern. Decide CI Bun floor to >=1.4.0 (1.2.x silently ignores spawn terminal) or keep feature-detect. Route must refuse when typeof Bun.Terminal is not function. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md.

**Context:**

S1 of the browser-editor epic. `src/config/sections/web.ts` (defaults + `WebSection` + `webMeta`, nested-terminal deep-partial overrides) registered through the full stack: `schema/web.ts` type + `Config.web`, schema barrel, `schema-class/web.ts` + factory `sections.web`/`defaults.web`, `env-map.ts` (auto `WEB_EDITOR`/`WEB_TERMINAL_ENABLED`/`WEB_TERMINAL_ALLOWREMOTE`), `json-schema/web.ts` + properties + required, `menu-data.ts` SECTION_GROUPS ("Platform"), domain-config lists (`load/constants.ts`, `hot-reload.ts`, `generate-domain-schemas.ts` → `config.web.*` files + `schemas/config.web.schema.json`), and a `validate()` blank-editor guard. `schemas/` artifacts regenerated (`schemas:check:fix`, toml + domain generators).

**Bun-floor decision:** CI keeps the `BUN_VERSION: "1.2.x"` pin (`.github/workflows/ci.yml:25`). Ticket text is ambiguous between bumping to >=1.4.0 and keeping the pin, so per epic sequencing the runtime feature-detect (`typeof Bun.Terminal === "function"` + refuse) that ships with the approach-B route is the guard; the floor bump is deferred until a CI-visible behavior depends on it.

**Acceptance Criteria:**

- [x] Implementation complete — `src/config/sections/web.ts` + the 10 registration touchpoints + regenerated `schemas/*` artifacts
- [x] Tests passing — `src/config/sections/web.test.ts` (7 tests: defaults, nested-merge, factory isolation, jsonSchema nesting, envMap paths, validate blank-editor) + full `bun test src/config/` 460 pass / 0 fail; gates `typecheck - backend`, `typecheck - bun`, `lint - eslint`, `format - dprint`, `size - strict`, `changelog - gate` all PASS
- [x] Documentation updated — `configs/env.example.yaml` (web block) + `docs/spec/implementation.md` env table + CHANGELOG [Unreleased]/Added

git issue: c9decab

**Resolved:** 2026-10-30 registry-driven close: git issue c9decab (registry tip: 605ae2478 Konstantin Fedotov Close issue)
