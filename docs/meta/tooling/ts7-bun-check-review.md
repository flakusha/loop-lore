<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TS7 Migration Dependency Review

Whether the TypeScript-7 toolchain dependencies added during the TS7 migration
can now be dropped, given that Bun 1.4.3 ships `bun check` — a built-in
TypeScript 7 type checker.

**Verdict: no dependency can be dropped today.** `typescript@^5.9.3` is
load-bearing (two independent upstream blockers, §2). The nominally redundant
one, `@typescript/native-preview`, has no safe replacement: `bun check` is
shadowed by this repo's `check` script, and the documented escape hatch
`bun --check` silently drops one of the four typecheck projects (§3).

Every claim below carries the probe that produced it. Two claims in the first
draft of this review were wrong and are corrected in place — the "no escape
hatch" claim (§3.1) and the shadowing rule (§4); see the correction notes there.

Worktree: `experimental-ts7-bun`. Host Bun: `1.4.3`.

---

## 1. What the TS7 migration actually installed

Three call sites consume the TS7-native compiler:

| Site | Command | Binary |
| --- | --- | --- |
| `package.json` → `typecheck` | `tsgo --noEmit --project tsconfig.backend.json` | `@typescript/native-preview` |
| `package.json` → `typecheck:frontend` | `tsgo --noEmit --project tsconfig.frontend.json` | `@typescript/native-preview` |
| `scripts/check/parallel/gate-table.mjs:32` → `typecheck - scripts` | `bunx tsgo --noEmit -p tsconfig.scripts.json` | `@typescript/native-preview` |

The repo has already evaluated and rejected the obvious alternative once. The
history, newest first:

- `15adddf57` *chore(deps): keep TS7 typechecking via native-preview, tsc@5 for
  ESLint compat* — restored `typescript@^5.9.3`, re-added
  `@typescript/native-preview`, repointed `typecheck*` at `tsgo`, and dropped the
  `typecheck:coverage*` scripts (`type-coverage` broke under TS7).
- `cf66a9b23` *chore(deps): remove @typescript/native-preview + dprint fmt*
- `2ec04aa96` *perf(typecheck): migrate to tsgo (TypeScript 7 native Go port)*

So the current state is a deliberate two-compiler split, not an oversight:
TS7-native for checking speed, TS5 (JS API) for everything that introspects the
compiler.

## 2. `typescript@^5.9.3` must stay — two independent upstream blockers

### 2.1 `typescript-eslint` peer range rejects TS7

`typescript-eslint@8.71.2` (current, and the installed version) declares:

```json
"peerDependencies": { "typescript": ">=4.8.4 <6.1.0" }
```

Verified from the published metadata. There is no newer major that lifts the
ceiling: `npm view typescript-eslint version` → `8.71.2`. ESLint is a blocking
gate (`lint - eslint`), so this alone pins `typescript` below 6.1.0.

### 2.2 TS7's default export is not the compiler

`typescript@7.0.2` is the Go port. Its package shape (from the published
tarball):

```json
"bin": { "tsc": "bin/tsc" },
"exports": { ".": "./lib/version.cjs", "./unstable/...": ... }
```

`lib/version.cjs` is the entire default export surface:

```js
const { version } = require("../package.json");
exports.version = version;
exports.versionMajorMinor = "7.0";
```

`lib/tsc.js` is a shim that `execve`s the platform binary from
`@typescript/typescript-<platform>` (an `optionalDependencies` matrix).

The API did not disappear — it **moved**. The exports map also carries
`./unstable/sync`, `./unstable/async`, `./unstable/ast`, `./unstable/ast/is`,
`./unstable/fs` and `./unstable/proto`. So the accurate statement is not "TS7 has
no compiler API", it is: **the default export is a version-only stub, and every
consumer that imports the compiler via the default export breaks.** All three
consumers in this repo import it that way (`import ts from "typescript"` /
`require("typescript")` — for `type-coverage-core` that is `require` in
`dist/{core,checker,dependencies,ignore,tsconfig}.js`), which is what TS5 and
TS6 expose and TS7 does not.
Porting them means moving to the `./unstable/*` subpaths — a rewrite, not a
version bump.

Three consumers in this repo import that API:

| Consumer | Import | Gate |
| --- | --- | --- |
| `scripts/check-file-size.ts:46` | `import ts from "typescript"` | `size - strict` (blocking) |
| `scripts/lib/src-refs.ts:12` | `import ts from "typescript"` | wiring checks |
| `type-coverage-core@2.30.4` | `ts.SyntaxKind.*` | `typecheck - coverage` / `... - frontend` (blocking, 95% floor) |

`type-coverage-core@2.30.4` is the **latest published** version and is *newer*
than the `2.30.1` recorded as broken in
`docs/meta/code-practices-improvements/01-strict-typing.md`. It is still broken:
`dist/checker.js:669` reads `ts.SyntaxKind.Unknown`, and the local-preview
failure with the same code path was never about that alias alone — TS7's
default export carries no `SyntaxKind` at all (`grep SyntaxKind` over
typescript@7.0.2's `lib/version.*` returns nothing), so the reference cannot
resolve in any spelling. Grepping both published versions side by side:

```
2.30.1  checker.js:662 → ts.SyntaxKind.Unknown   (broken)
2.30.4  checker.js:669 → ts.SyntaxKind.Unknown   (still broken)
```

No upstream fix exists. So `typescript` cannot move to `^7` until
`type-coverage-core` is rewritten against the `./unstable/sync` API (or replaced)
**and** `typescript-eslint` lifts its peer ceiling.

> Note for the future: `typescript@6.0.3` exists and *is* JS-API capable
> (`@markuplint/pretenders@5.1.1` depends on it as a plain runtime dependency).
> Bumping `typescript@^5.9.3` → `^6.0.3` would also satisfy the
> `typescript-eslint` ceiling. That is a separate, untriaged upgrade — it is not
> a TS7 migration and it is not in scope here.

## 3. `@typescript/native-preview` is redundant in principle, but has no safe replacement

`@typescript/native-preview@7.0.0-dev.20260707.2` is the same Go compiler that
`typescript@7.0.2` ships as its `tsc` binary — the dev preview was just the
pre-stable channel. `bun check` (Bun 1.4.3) is a port of the same
`typescript-go` and advertises 100% of TypeScript 7.0.2's conformance suite
(51,210/51,210), so a zero-install replacement exists in principle.

It cannot be used in this repo — for two different reasons, both silent.

### 3.1 `bun check` is shadowed — but there is a documented escape hatch

This repo has a script named `check` (`"check": "bun run check:parallel"`), and
Bun documents the behaviour explicitly (`bun.com/docs/runtime/check`, section
*If `package.json` has a `check` script*): *"Your script wins. `bun check` runs
it, like `bun run check`. To run the type checker in that project, use
`bun --check`."*

Probed in an isolated fixture (`.tmp/buncheck-conflict/`) with scripts
`check: "echo MARKER"` and `typecheck: "bun check -p tsconfig.json"`:

```
$ bun check -p tsconfig.json
$ echo MARKER_SCRIPT_SHADOWED args=$@ -p tsconfig.json
MARKER_SCRIPT_SHADOWED args= -p tsconfig.json
$ bun run typecheck
$ bun check -p tsconfig.json
$ echo MARKER_SCRIPT_SHADOWED args=$@ -p tsconfig.json
MARKER_SCRIPT_SHADOWED args= -p tsconfig.json
EXIT=0
```

So writing `"typecheck": "bun check -p tsconfig.backend.json"` produces a gate
that type-checks nothing and always passes. Not a wrong-answer bug — a removed
gate. The shadowing applies with flags, and from a subdirectory too (Bun walks
up to the nearest `package.json`).

The escape hatch is `bun --check` (leading `--`), which runs the type checker
regardless of the script. Probed on the same fixture:

```
$ bun --check src.ts
<error file="src.ts" line="1" column="7" code="TS2322">
Type 'string' is not assignable to type 'number'.
[exit=1]
$ bun --check
✓ No type errors in 4,375 files [1100.90ms]
[exit=0]
```

### 3.2 The escape hatch does not cover this repo's gate layout

`bun --check` cannot select a project. The repo has four:
`tsconfig.json` (root), `tsconfig.backend.json`, `tsconfig.frontend.json` and
`tsconfig.scripts.json`.

- `bun --check -p tsconfig.backend.json` — **does not work.** `-p` is Bun's own
  `--print` flag, so the tsconfig path is evaluated as code:
  `<error file="[eval]" code="TS2304"> Cannot find name 'tsconfig'`, exit 1.
- `bun --check --project tsconfig.backend.json` — **does not work.** Bun treats
  it as an entry point to run: `error: Cannot run ".../tsconfig.backend.json" /
  note: Bun cannot run json files directly`.
- `bun --check --project=tsconfig.frontend.json` — **silently ignored.** Reports
  the root project's file count (4,375), not the frontend project's.

Bare `bun --check` always uses the nearest `tsconfig.json` from cwd, and the
repo has exactly one at the root. That project's `include` is
`["src/**/*", "tests/**/*"]` — so **`scripts/**/*.ts` is not in it**, and
`typecheck - scripts` has no substitute.

Proven by planting a real error, not inferred. In a file that only the scripts
project covers:

```ts
// scripts/__ts7probe.ts
export const ts7Probe: number = "this must be a number";
```

```
$ bun --check
✓ No type errors in 4,375 files [1060.13ms]      # exit 0 — MISSES IT
$ ./node_modules/.bin/tsgo --noEmit -p tsconfig.scripts.json
scripts/__ts7probe.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
                                                          # exit 1 — catches it
```

`bun --check` would silently *widen* nothing and *narrow* one blocking gate.
That is the same removed-gate failure mode as `bun check`, reached through the
documented escape hatch. (Probe file deleted afterwards.)

### 3.3 The unblock is more expensive than the dependency

Switching to `bun --check` requires either renaming the `check` script (so the
built-in is reachable under its own name) or accepting a narrower gate set.
Options, all rejected:

- **Rename the `check` script.** `bun run check` is the canonical entry point in
  `AGENTS.md` (verification gates, scratchpad table, worktree section),
  `CONTRIBUTING.md`, the PR checklist, all six localized `README`s`, and
  `docs/meta/**`. Renaming it to free a bun built-in name is a doc-contract
  change, not a `devDependency` change.
- **Commit a stub `package.json` without a `check` script** (e.g.
  `tooling/tscheck/`) and run the gates from there. Adds a confusing directory
  whose only purpose is to defeat name resolution.
- **`typescript@7` under an npm alias** (`"ts7": "npm:typescript@^7.0.2"`). This
  installs the same compiler under a stable tag, but the bin collision resolves
  **silently and the alias wins**. Verified in an isolated scratch install
  (`typescript@^5.9.3` + `ts7: npm:typescript@7.0.2`, no error, no warning):

  ```
  node_modules/.bin/tsc       -> ../ts7/bin/tsc            # TS7
  node_modules/.bin/tsserver  -> ../typescript/bin/tsserver # TS5
  $ node_modules/.bin/tsc --version
  Version 7.0.2
  ```

  So `typescript@5.9.3`'s `tsc` bin is silently displaced. Nothing in this repo
  invokes `tsc` today (`package.json`, `scripts/check/parallel/gate-table.mjs`
  and `.githooks/` all use `tsgo` / `bun run typecheck`), so the damage is
  latent rather than live — it would bite the first script, hook or editor that
  calls `tsc`. Still a silent toolchain swap for a `devDependency` swap.

Against that: `@typescript/native-preview` costs one installed package plus one
platform binary (Bun skips the other six `optionalDependencies`).

The two compilers are the same lineage, now on different release channels —
`tsgo --version` reports `7.0.0-dev.20260707.2`, while `typescript@7.0.2`'s
`tsc --version` reports `7.0.2`. The stable tag postdates the July 2026 dev
preview, so `@typescript/native-preview` is strictly the older build.

**Skipped: dropping `@typescript/native-preview`. Add it only when
`type-coverage-core` runs against the TS7 `./unstable/sync` API *and*
`typescript-eslint` lifts its peer ceiling — at that point `typescript@^7`
replaces both packages and no alias is needed.**

## 4. Which Bun 1.4.3 entry points are shadowed, and which are not

Measured on a fixture declaring `check`, `test`, `build` and `typecheck`
scripts. `check` is the shadowed one; `test` and `build` are not.

| Command | Runs | Evidence |
| --- | --- | --- |
| `bun check` | the `check` **script** | `MARKER_check`, exit 0 |
| `bun check -p tsconfig.json` | the `check` **script** | `MARKER_check -p tsconfig.json` — flags forwarded as script args, exit 0 |
| `bun test --check` | the **built-in** test runner | `bun test v1.4.3 … 0 test files matching`, exit 1 |
| `bun build --check src.ts` | the **built-in** bundler + checker | reports `TS2322`, exit 1 |
| `bun typecheck` | the `typecheck` **script** | `MARKER_typecheck`, exit 0 |
| `bun --check src.ts` | the **built-in** type checker | reports `TS2322`, exit 1 |
| `bun run --check typecheck` | the `typecheck` **script**, after checking | `MARKER_typecheck`, exit 0 |

So `bun test --check` and `bun build --check` are safe from the `check`-script
collision — earlier drafts of this review asserted they were safe *because* the
shadowing applies only to the bare subcommand name. That reasoning was wrong and
is corrected here: the distinction is per-subcommand, and only `check` loses to
a script. Worth knowing because it is exactly the kind of claim that reads true
and is not.

`bun build --check` is tempting as a per-project gate, but it checks only what
the bundler reads from the given entry points, so it is not a substitute for a
`tsconfig`-scoped `--noEmit` pass over `src/**` or `scripts/**`.

## 5. Consequence for anyone adding a type-checking script

- **Never write `bun check`** in `package.json` scripts,
  `scripts/check/parallel/*`, or CI workflows. It resolves to the gate runner
  and the resulting gate passes vacuously. Write `bun --check` if you want the
  built-in type checker.
- **`bun --check` is not a drop-in for the tsgo gates either** — it cannot select
  a project, and it silently skips `scripts/**`. Do not repoint
  `typecheck - scripts` at it.
- **`tsgo` and `tsc` remain the unambiguous spellings** for a project-scoped
  check in this repo.
