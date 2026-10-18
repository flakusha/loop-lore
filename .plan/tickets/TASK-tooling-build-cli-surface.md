<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: the CLI surface — subcommands and flags

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-tooling-build.md
**Caveats:** `src/cli/parser.ts` re-exports only a specific set of Optique combinators (`argument`, `flag`, `multiple`, `object`, `option`, `optional`, `withDefault`, plus `choice`, `integer`, `string` value parsers) — anything else must be added there first, not imported directly from `@optique/core`. `runScript` exits the process on a parse error or on `--help`, so a script using it cannot be asserted in-process; tests must spawn it as a child, as `scripts/check-changelog.test.ts` already documents.

**Summary:** Wire the build subcommands and every flag through the repo's existing Optique parser, with `--dry-run` and no invented API.

**Acceptance Criteria:** All subcommands and flags parse through `runScript`; `--dry-run` prints the resolved plan without executing; every exported function takes an options object; `cli.test.ts` and `main.test.ts` reach >= 80% line coverage. Full checklist under [Acceptance Criteria](#acceptance-criteria).

**Context:** The repo has a shared CLI parser at `src/cli/parser.ts` that wraps `@optique/run`, and every script entry point is expected to use it rather than walking `process.argv` by hand. The design must reuse its real exports rather than invent an API.

## Scope

Create `scripts/tooling/cli.ts` and `scripts/tooling/main.ts`.

## Constraints and pitfalls

**Use the real exports.** From `src/cli/parser.ts`:

- `runScript<T extends Parser>(parser: T, options?: ScriptRunOptions): InferValue<T>`
- combinators: `object`, `flag`, `argument`, `multiple`, `option`, `optional`, `withDefault`
- value parsers: `choice`, `integer`, `string`
- `ScriptRunOptions`: `programName`, `brief`, `description`, `examples`, `version`, `help`, `completion`, `showDefault`, `errorExitCode`, `args`

**No boolean parameters.** The ban is on boolean *function* parameters. Every exported function takes a single options object (`{ native: boolean }`), never `configure(variant, true)`. CLI switches that are inherently boolean are fine on the Optique side; they become object fields internally.

**No `any`, no bare `.then()`, no `console.*`, no `eslint-disable`.** Output goes through `src/logger/`: `createLogger()` then `getLogger().child({ module })`, as `scripts/seed-users.ts:118-119` does.

**Every file gets the SPDX header**, `// size-allow: N` if it legitimately needs a different budget, and JSDoc `@throws` on anything that throws.

## Command surface

| Subcommand | flag | type | default | meaning |
|---|---|---|---|---|
| *(all)* | `--project` | `choice(...)` | — | required target project |
| *(all)* | `--accelerator` | `choice(...)` | `cpu` | backend to enable |
| *(all)* | `--arch` | `choice(x64, arm64)` | host arch | target architecture |
| *(all)* | `--install-root` | string | per-variant dir | `CMAKE_INSTALL_PREFIX`; user-selectable |
| *(all)* | `--link-dir` | string | *(none)* | optional separate PATH symlink directory |
| *(all)* | `--ref` | string | *(none)* | pinned ref |
| *(all)* | `--latest` | flag | off | resolve `latest` numerically, check out detached |
| *(all)* | `--jobs` | integer | `min(nproc, 8)` | parallel build width |
| *(all)* | `--native` | flag | **off** | set `GGML_NATIVE=ON` |
| *(all)* | `--gpu-targets` | string | *(none)* | `GPU_TARGETS` (rocm), `MUSA_ARCHITECTURES` (musa) |
| *(all)* | `--cuda-archs` | string | *(none)* | `CMAKE_CUDA_ARCHITECTURES` |
| *(all)* | `--blas-vendor` | `choice(...)` | `Generic` | `GGML_BLAS_VENDOR` |
| *(all)* | `--webp-source` | `choice(submodule, system)` | `submodule` | sd webp/webm I/O source |
| *(all)* | `--embed-ui` | flag | off | llama-swap: add `-tags embed_ui` |
| *(all)* | `--dry-run` | flag | off | print the resolved plan, execute nothing |
| `link` | `--force` | flag | off | rewrite existing symlinks |
| `clean` | `--variant-only` | flag | on | drop this variant's tree, not the whole temp root |
| `verify` | `--json` | flag | off | machine-readable output |

## Acceptance Criteria

- [ ] Every subcommand parses through `runScript`; no file walks `process.argv` directly.
- [ ] Only the combinators `src/cli/parser.ts` actually re-exports are used.
- [ ] `--dry-run` prints ref, resolved flags, build dir, install root, link dir, and every command that would run — and executes none of them.
- [ ] `--native` defaults off; `--jobs` defaults to `min(nproc, 8)`.
- [ ] No exported function takes a boolean parameter; every one takes an options object.
- [ ] No `any`, no bare `.then()`, no `console.*`, no `eslint-disable`.
- [ ] All shell-out uses Bun's `$` tagged template.
- [ ] Every file carries the SPDX header and JSDoc `@throws` on throwing paths.
- [ ] CLI tests spawn the script as a child process rather than importing it, covering `--dry-run` and the flag defaults.
- [ ] A colocated `scripts/tooling/cli.test.ts` and `scripts/tooling/main.test.ts` reach **>= 80% line coverage** of `cli.ts` and `main.ts` respectively under `bun run test:coverage`, so `bun run scripts/check/coverage.mjs --floor=80` passes for both modules with no waiver.
- [ ] Both files pass `giwt plan check-file-size` at 250 code lines.
