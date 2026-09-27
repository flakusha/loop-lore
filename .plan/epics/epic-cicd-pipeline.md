<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: CI/CD Pipeline

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Low

## Summary

loop-lore uses GitHub Actions for continuous integration and deployment. The pipeline enforces quality gates (lint, typecheck, license headers, secret scan), runs the full test pyramid (unit, integration, browser e2e), benchmarks performance against the regression suite, and automates releases based on conventional commits.

**Context:** The 2026-09-19 docs-vs-plan audit (`epic-docs-vs-plan-gap-audit-2026-09-19.md`) flagged that the existing CI workflow has weak matrix coverage (single OS, single Node version) and no performance regression gating. `epic-release-010.md` blocks on a green pipeline that produces signed artefacts. This epic implements the pipeline shape defined in `docs/spec/cicd-pipeline.md` and reuses the gate scripts in `scripts/check-parallel.mjs`.

## Scope

- **Quality gates** invoked on every push + PR:
  - `bun run lint` (ESLint + Prettier check)
  - `bun run typecheck` (TypeScript, both client + server projects)
  - `bun run license:check` (SPDX headers — already enforced via `scripts/check-parallel.mjs`)
  - `bun run secrets:scan` (gitleaks)
- **Test pyramid** with matrix:
  - Unit tests (`bun test`) — every push
  - Integration tests (`bun run test:integration`) — PR only, with Postgres + Redis services
  - Browser e2e (`bun run test:e2e`) — PR only, headless
- **Performance regression**: `epic-benchmark-ci-regression.md` benchmarks against thresholds; fail the build if > 5% regression on any tracked benchmark.
- **Build matrix**: Linux + macOS + Windows runners × Node LTS + Bun latest × arm64 + x64.
- **Release workflow**: conventional-commit parsing → semver bump → changelog → tag → signed container image → publish to GHCR.
- **Deployment artefacts**: container image + native binary bundles (per `epic-precompiled-hot-binaries.md`) + SBOM.

### Pipeline shape (single source of truth)

```
push / PR  ──▶  quality-gates  ──▶  test-pyramid  ──▶  benchmark-regression  ──▶  merge
                                                                    │
                                                                    ▼
                                                            release workflow
                                                                    │
                                                  ┌─────────────────┼─────────────────┐
                                                  ▼                 ▼                 ▼
                                          semver + changelog   signed image      SBOM publish
```

### Out of scope

- Auto-deploy to user environments (handled by `epic-deployment-infrastructure.md`).
- Canary / blue-green rollout (not yet a need; revisit on first multi-tenant deploy).

## Acceptance Criteria

- [ ] Single `.github/workflows/ci.yml` with quality-gates → test-pyramid → benchmark-regression stages
- [ ] Build matrix covers Linux + macOS + Windows × Node LTS + Bun latest × arm64 + x64
- [ ] Conventional commits drive semver bump + auto-generated changelog
- [ ] Signed container image + SBOM published to GHCR on tag
- [ ] `epic-benchmark-ci-regression.md` thresholds wired in; > 5% regression fails the build
- [ ] All gates non-skippable for PR merges into `dev` or `main`

## Related Epics

- `docs/spec/cicd-pipeline.md` — full pipeline specification
- `epic-release-010.md` — consumer of pipeline output
- `epic-benchmark-ci-regression.md` — performance regression stage
- `epic-deployment-infrastructure.md` — deploys pipeline artefacts
- `epic-code-quality.md` — lint/typecheck gate inputs
- `epic-testing-qa.md` — test pyramid sources

## Tickets

## Integration Points

### Systems This Epic Depends On

<!-- Systems whose output this epic consumes -->

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Testing & QA | Test runners, coverage gates, e2e harness | CI invokes the existing test suite |
| Code Quality | Lint, typecheck, license headers | Pipeline enforces quality gates |
| Continuous Improvement | Build + coverage reporting | Same scripts reused in CI |
| Deployment Topologies | Build artefacts, container images | Pipeline produces what deploy consumes |

### Systems That Depend On This Epic

<!-- Systems that consume this epic's output -->

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Deployment Infrastructure | Pipeline-produced artefacts / images | Deploy consumes CI output |
| Release 0.1.0 | Tag + push gate | Pipeline produces the release artefacts |
| Cross-Platform Portability | Build matrix jobs | Per-OS/arch coverage in CI |

### Shared Data Contracts

<!-- Types, interfaces, or schemas shared between this and other systems -->

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Conventional commit | Release pipeline, changelog | Commit-message-driven versioning |
| CI artefact manifest | Deployment, Release | What build produced (binary/image/checksums) |

### Cross-System Events

<!-- Events this system emits or subscribes to from other systems -->

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `pipeline.completed` | emits → Release, Deployment | Artefacts ready |
| `pipeline.failed` | emits → Notification | Quality gate regression |
| `release.tagged` | subscribes ← Release | Trigger release workflow |
