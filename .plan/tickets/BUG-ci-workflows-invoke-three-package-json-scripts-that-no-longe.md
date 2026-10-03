<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: CI workflows invoke three package.json scripts that no longer exist

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

`ci.yml`, `dev-release.yml` and `release.yml` each invoke a `package.json` script that does not exist. `bun run <name>` fails with `error: Script not found` and exit 1, so these `run:` steps fail unconditionally — every run of the affected job, on every branch.

## Reproduction

```
$ bun run lint:css
error: Script not found "lint:css"          # exit 1
$ bun run test:unit:parallel
error: Script not found "test:unit:parallel" # exit 1
```

`package.json` defines none of the three.

## Invocations

| Script | Invoked at |
|---|---|
| `lint:css` | `.github/workflows/ci.yml:48` (`- name: Lint CSS` / `run: bun run lint:css`) |
| `lint:html` | `.github/workflows/ci.yml:51` (`- name: Lint HTML` / `run: bun run lint:html`) |
| `test:unit:parallel` | `.github/workflows/dev-release.yml:58` and `.github/workflows/release.yml:58` (`- name: Run unit tests` / `run: bun run test:unit:parallel`) |

## How the drift happened

Two separate removals, each of which updated one call site and missed others:

- `318fc019c` (2026-08-22) `refactor(scripts): reorder & cluster package.json scripts, drop aliases` dropped `lint:css` and `lint:html` from the `check:serial` chain. Its message claims `ci.yml` was cross-reconciled; the `ci` script at `ci.yml:45` was updated, but `:48` and `:51` were not.
- `b482d0ad3` (2026-09-17) `fix(test): parallelize bun test invocations` folded `test:unit:parallel` into `test:unit` (now `bun test --parallel=4 src/ --isolate`, `package.json:67`). The `ci` script was updated; `dev-release.yml:58` and `release.yml:58` were not.

Neither workflow has run past that step since, so the breakage was never surfaced.

## Owner decision: which linter supersedes each dropped alias

The CSS and HTML linters are not merely renamed — the underlying tool is an open question, and the config files for both candidates are still in the tree:

- **`lint:css`** — candidates: `stylelint` (devDependency present, config `.stylelintrc.json` present) or `biome`. Note `lint:biome` is currently scoped to `docs/` only (`package.json:40`: `biome lint docs/`), so adopting biome for CSS would mean widening its scope.
- **`lint:html`** — candidates: `markuplint` (devDependency present, config `.markuplintrc.json` present) or `biome`. `lint:eslint` covers some HTML-adjacent rules but is not an HTML linter.

Whichever is chosen, the config file is already committed, so the work is mostly to re-add the script pointing at it — but only after confirming the tool is actually wired to lint the right files. Selecting the tool is a maintainer decision, not a mechanical fix.

`test:unit:parallel` has no such ambiguity: `test:unit` (`package.json:67`) is the drop-in replacement and already carries `--parallel=4`. That one is mechanical.

## Stale docs

Two files still document the removed scripts as part of the check chain and will need the same reconciliation:

- `docs/meta/code-practices-improvements/02-eslint-and-static-analysis.md:19-20`
- `docs/meta/code-practices-improvements/05-testing-e2e-multiple-db.md:19-20`

## Acceptance Criteria

- [ ] Every `run:` step in `.github/workflows/*.yml` names a `package.json` script that exists (add a CI lint or test that validates workflow `run: bun run X` invocations against the `scripts` block)
- [ ] `lint:css` and `lint:html` resolved to a chosen linter, with the choice recorded in the ticket resolution
- [ ] `dev-release.yml:58` and `release.yml:58` invoke an existing script
- [ ] The two stale docs no longer reference the removed script names

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
