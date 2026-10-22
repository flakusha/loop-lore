<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TS7 Migration Dependency Review

Whether the TypeScript-7 toolchain dependencies added during the TS7 migration
can now be dropped, given that Bun 1.4.3 ships `bun check` — a built-in
TypeScript 7 type checker.

**Verdict: `typescript@^5.9.3` cannot be dropped. `@typescript/native-preview`
is no longer blocked by the reason this review first recorded, but is not
dropped here.**

`typescript@^5.9.3` is load-bearing — two independent upstream blockers, both
re-verified on 2026-10-22 (§2): the `typescript-eslint` peer ceiling, and
`type-coverage-core` needing the TS5/TS6 compiler API.

The nominally redundant one, `@typescript/native-preview`, was recorded here as
having "no safe replacement", because the `bun check` script shadows the
built-in subcommand and the documented escape hatch `bun --check` was believed
unable to select a project. **That second reason was wrong** (§3.2, corrected):
Bun's *global* `--tsconfig-override` flag does select a project, and it works
on all three of this repo's project tsconfigs, with the same error kinds
`tsgo` reports. A drop-in replacement for the three `tsgo` gates therefore
exists. Dropping the dependency is still not done here: it means rewiring
three gate call sites, which is a code change, not a documentation conclusion.
What does *not* change is that `bun check` (the bare subcommand) stays
shadowed, and that `type-coverage` still blocks moving `typescript` to `^7`.

Every claim below carries the probe that produced it. Three claims in the first
draft of this review were wrong and are corrected in place — the "no escape
hatch" claim (§3.1), the shadowing rule (§4), and the "no project selection"
claim (§3.2); see the correction notes there, and the correction log below for
the full list.

Worktree: `experimental-ts7-bun`. Host Bun: `1.4.3`.
Correction pass: 2026-10-22, on `dev`.

---

## Correction log

Dated, so the correction history is itself auditable. Each entry says what was
wrong, what the probe showed, and where the text changed.

| Date | Claim | What was wrong | What the probe showed | Changed in |
| --- | --- | --- | --- | --- |
| 2026-10-22 | §3.2 — "The escape hatch does not cover this repo's gate layout" | `bun --check` was claimed unable to select a project, and `typecheck - scripts` was claimed to have no substitute | Bun has a **global** `--tsconfig-override=<val>` flag. It selects a project, works on all three of this repo's project tsconfigs, and reports the same error kinds `tsgo` does | §3.2, §3.3, §3.4, §5 |
| 2026-10-22 | §2.1 — `typescript-eslint@8.71.2` | The version cite was stale | Installed and published-latest is `8.72.0`; the peer ceiling `>=4.8.4 <6.1.0` is unchanged, and there is still no newer major | §2.1 |
| 2026-10-22 | §2.2 — `type-coverage-core` "is still broken", "no upstream fix exists" | The failure mode was mis-described as an unhandled `TypeError` at `checker.js:669` | `core.js:211-218` `assertCompilerApi()` runs *first* and throws a designed, actionable error; the CLI exits 1 with a clean message. It fails loudly and cleanly — it does not crash. The *conclusion* (typescript stays at 5.x) is unchanged | §2.2 |
| 2026-10-22 | §3.1 — the `bun check` script shadowing | Not wrong — recorded so the log is complete | There is no `--no-script` escape in Bun 1.4.3: `bun check --no-script` → `error: Unknown flag "--no-script"` | §3.1 |

One downstream comment is now stale but was left alone, being outside this
document: `scripts/check/parallel/gate-table.mjs` describes `typecheck - bun` as
unable to select a project. That is the C1 claim this log corrects.

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

`typescript-eslint@8.72.0` (current, and the installed version) declares:

```json
"peerDependencies": { "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0", "typescript": ">=4.8.4 <6.1.0" }
```

Verified from the installed `node_modules/typescript-eslint/package.json` and
from the published metadata. There is no newer major that lifts the ceiling:
`npm view typescript-eslint version` → `8.72.0` (dist-tags: `latest` 8.72.0,
`canary` 8.72.1-alpha.7, `rc-v8` 8.0.0-alpha.62 — no 9.x). ESLint is a
blocking gate (`lint - eslint`), so this alone pins `typescript` below 6.1.0.

> **Correction (2026-10-22).** The first draft cited `8.71.2`. The version
> moved to `8.72.0`; the peer ceiling did not. The conclusion of this section is
> unchanged — `typescript` still cannot move to `^7` on the ESLint gate alone.

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
`docs/meta/code-practices-improvements/01-strict-typing.md`. It still does not
run under TS7 — but it fails **loudly and cleanly**, not by crashing.

> **Correction (2026-10-22).** The first draft of this section described the
> failure as an unhandled `TypeError` at `dist/checker.js:669`, said the
> reference "cannot resolve in any spelling", and framed the package as simply
> broken. The mechanism was wrong; the conclusion was not. `checker.js:164`
> does call `createSkippedNodeKinds()` unguarded, and `checker.js:669` does
> read `ts.SyntaxKind.Unknown` — but **that call site is unreachable in the
> real CLI**, because `core.js:211-218` `assertCompilerApi()` runs first and
> throws a designed, actionable error. Under a real `typescript@7.0.2` the CLI
> exits 1 with a clean message. It does not crash, and it does not need to be
> debugged at `checker.js:669`.

The guard that actually fires, `type-coverage-core@2.30.4` `dist/core.js:211-218`,
verbatim:

```js
function assertCompilerApi() {
    if (typeof ts.createProgram !== 'function') {
        throw new Error(`type-coverage needs the TypeScript compiler API (ts.createProgram), which typescript@${ts.version} does not export.
Keep typescript@${ts.version} for your project and give type-coverage TypeScript 6. With npm, add this to package.json:
  "overrides": { "type-coverage-core": { "typescript": "npm:@typescript/typescript6@^6" } }
TypeScript 7 support: https://github.com/plantain-00/type-coverage/issues/147`);
    }
}
```

And the unreachable site it pre-empts, `dist/checker.js:164`:

```js
    skippedNodeKinds !== null && skippedNodeKinds !== void 0 ? skippedNodeKinds : (skippedNodeKinds = createSkippedNodeKinds());
```

which reads `ts.SyntaxKind.Unknown` at `dist/checker.js:669`:

```js
const createSkippedNodeKinds = () => new Set([
    ts.SyntaxKind.Unknown,
    ts.SyntaxKind.EndOfFileToken,
    // ... further trivia, literal and token kinds elided ...
]);
```

The upstream comment at `dist/checker.js:666` —
`// Built on first use so this module still loads when typescript has no SyntaxKind (typescript@7)` —
is accurate about module **load** only, not a runtime guard: it keeps the
module importable, which is what lets `core.js` reach its own check and print
the designed message.

Reproduced end to end in a throwaway sandbox (`.tmp/ts7doc/sandbox/`, deleted
afterwards) with the *real* published packages — `typescript@7.0.2` +
`type-coverage@2.30.4` + `type-coverage-core@2.30.4`, against a minimal
`tsconfig.json` and one source file:

```
$ node -p "require('typescript/package.json').version"
7.0.2
$ ./node_modules/.bin/type-coverage --strict --at-least 95 --project tsconfig.json
type-coverage needs the TypeScript compiler API (ts.createProgram), which typescript@7.0.2 does not export.
Keep typescript@7.0.2 for your project and give type-coverage TypeScript 6. With npm, add this to package.json:
  "overrides": { "type-coverage-core": { "typescript": "npm:@typescript/typescript6@^6" } }
TypeScript 7 support: https://github.com/plantain-00/type-coverage/issues/147
EXIT=1
```

stdout carries the message; stderr is empty. Exit code 1, no stack trace, no
`TypeError`.

(That message names the upstream issue the maintainers track for TS7 support:
`plantain-00/type-coverage#147`. The mechanism is a deliberate, documented
guard — so "no upstream fix exists" was the wrong framing. The *outcome* the
review needs is the same: `type-coverage-core` cannot run against TS7's
default export.)

**Conclusion unchanged:** `typescript` cannot move to `^7` until
`type-coverage-core` is rewritten against the `./unstable/sync` API (or replaced)
**and** `typescript-eslint` lifts its peer ceiling. A reader should not take
the mechanism correction above as a verdict reversal — the blocker is real and
is still there.

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

It cannot be used in this repo as `bun check` — for two different reasons,
both silent. (One of the two reasons was mis-described; see §3.2.)

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

There is **no `--no-script` escape** in Bun 1.4.3. Probed in a fixture with no
`check` script, so the built-in is what answers:

```
$ bun check --no-script
error: Unknown flag "--no-script"
note: run 'bun check --help' for more information
[exit=1]
```

The flag is not recognised at all. So the script-shadowing problem has exactly
two workarounds in 1.4.3: the documented `bun --check` escape hatch, and
`bun check` from a directory whose nearest `package.json` has no `check` script.
There is no third.

### 3.2 The escape hatch *can* select a project — via `--tsconfig-override`

> **Correction (2026-10-22).** The heading of this section used to read "The
> escape hatch does not cover this repo's gate layout", and the body claimed
> `bun --check` cannot select a project. **That claim was wrong.** Bun has a
> *global* `--tsconfig-override=<val>` flag, and it selects a project. The
> original probes were all *subcommand-local* flags (`-p`, `--project`), which
> behave differently from the global one — the probes were real, the inference
> from them was not. Re-probed and corrected below; both the old probes and the
> new one are shown so the correction is evidenced in both directions.

Bun's own help lists the flag:

```
$ bun --help | grep tsconfig
      --tsconfig-override=<val>       Specify custom tsconfig.json. Default $cwd/tsconfig.json
```

The repo has four tsconfigs: `tsconfig.json` (root), `tsconfig.backend.json`,
`tsconfig.frontend.json` and `tsconfig.scripts.json`. The flag works on all
three project tsconfigs — bare `bun --check` (root project, `src/**` ∪
`tests/**`) for comparison:

```
$ bun --check
✓ No type errors in 4,589 files [1.84s]
[exit=0]
$ bun --check --tsconfig-override=tsconfig.backend.json
✓ No type errors in 3,889 files [2.19s]
[exit=0]
$ bun --check --tsconfig-override=tsconfig.frontend.json
✓ No type errors in 1,767 files [1460.17ms]
[exit=0]
$ bun --check --tsconfig-override=tsconfig.scripts.json
✓ No type errors in 2,253 files [1.68s]
[exit=0]
```

The file counts differ per project, so the flag is genuinely selecting, not
ignoring. It also accepts an absolute path
(`--tsconfig-override=/home/flak/git-ai/loop-lore/tsconfig.backend.json` → the
same backend count as the relative form, exit 0), which matters because the
`typecheck - scripts` gate runs `bunx tsgo` from the repo root.

Proven by planting real errors, not inferred. One error in `scripts/**` (only
the scripts project covers it) and one in `src/frontend/**` (only the frontend
project covers it):

```
$ bun --check
<error file="src/frontend/__ts7probe.ts" line="1" column="14" code="TS2322">
Type 'string' is not assignable to type 'number'.
[exit=1]
$ bun --check --tsconfig-override=tsconfig.backend.json
✓ No type errors in 3,889 files [1.68s]           # exit 0 — correctly excludes src/frontend
$ bun --check --tsconfig-override=tsconfig.frontend.json
<error file="src/frontend/__ts7probe.ts" line="1" column="14" code="TS2322">
Type 'string' is not assignable to type 'number'.
[exit=1]
$ bun --check --tsconfig-override=tsconfig.scripts.json
<error file="scripts/__ts7probe.ts" line="1" column="14" code="TS2322">
Type 'string' is not assignable to type 'number'.
[exit=1]
```

Each project sees exactly its own scope: the backend override excludes
`src/frontend/**` (per `tsconfig.backend.json`'s `exclude`), the frontend
override sees only `src/frontend/**`, the scripts override sees only
`scripts/**` and catches the scripts error that bare `bun --check` misses.
(Probe files deleted afterwards.)

The override also honours each project's `compilerOptions`, so it is a real
project selection and not a different file glob. `tsconfig.backend.json` sets
`noUnusedLocals: true`; `tsconfig.scripts.json` overrides it to `false`:

```
$ bun --check --tsconfig-override=tsconfig.backend.json
<error file="src/__ts7strict.ts" line="2" column="9" code="TS6133">
'unusedLocal' is declared but its value is never read.
[exit=1]
$ bun --check --tsconfig-override=tsconfig.scripts.json
✓ No type errors in 2,253 files [1281.16ms]
[exit=0]
```

`tsconfig.scripts.json` `extends` `tsconfig.backend.json`, so `strict` still
applies to the scripts project through the override — an implicit-any
parameter is caught identically by both compilers:

```
tsgo --noEmit -p tsconfig.scripts.json             → 1× TS7006
bun --check --tsconfig-override=tsconfig.scripts.json → 1× TS7006
```

And the error *kinds* match `tsgo` one for one, per project. Planted a TS2322
(type mismatch), a TS2304 (unknown identifier) and a TS6133 (unused local) in
the backend project, and a TS2322 + TS2304 in the scripts project:

```
BACKEND  tsgo → 1× TS2304, 1× TS2322, 1× TS6133   (exit 1)
BACKEND  bun  → 1× TS2304, 1× TS2322, 1× TS6133
SCRIPTS  tsgo → 1× TS2304, 1× TS2322               (exit 1)
SCRIPTS  bun  → 1× TS2304, 1× TS2322
```

`tsgo --noEmit -p tsconfig.<project>.json` and
`bun --check --tsconfig-override=tsconfig.<project>.json` agree on the error
kinds and the affected files, for all three project tsconfigs.

#### The old probes, re-run

The first draft's probes are reproduced verbatim so the correction is evidenced
in both directions. They were accurate observations — of the wrong flags:

- `bun --check -p tsconfig.backend.json` — **does not work.** `-p` is Bun's own
  `--print` flag, so the tsconfig path is evaluated as code:
  `<error file="[eval]" line="1" column="1" code="TS2304"> Cannot find name
  'tsconfig'`, exit 1.
- `bun --check --project tsconfig.backend.json` — **does not work.** Bun treats
  it as an entry point to run: `error: Cannot run ".../tsconfig.backend.json" /
  note: Bun cannot run json files directly`, exit 1.
- `bun --check --project=tsconfig.frontend.json` — **silently ignored.** Reports
  the root project's file count, not the frontend project's.

Note what those three have in common: none of them is
`--tsconfig-override`. `-p` and `--project` are not project-selection flags on
`bun --check`; the global `--tsconfig-override` is. `bun check` (the built-in
subcommand, not the `bun --check` escape hatch) does have its own `-p` /
`--project` flag — verified from `bun check --help` — but that subcommand is
the one this repo's `check` script shadows (§3.1), so it is not reachable
here.

#### What this changes, and what it does not

What changes: the escape hatch now covers **all three** project tsconfigs, so
`typecheck - scripts` is not left without a substitute, and the "same
removed-gate failure mode reached through the documented escape hatch"
argument no longer holds. §3.3's conclusion is revisited below.

What does not change:

- `bun check` (bare subcommand) is still shadowed by this repo's `check`
  script, and there is still no `--no-script` escape in 1.4.3 (§3.1).
- `type-coverage` still blocks moving `typescript` to `^7` (§2.2). The
  `bun --check` replacement covers the three *tsgo* gates only; the
  `typecheck - coverage*` gates run `type-coverage`, which needs the TS5/TS6
  compiler API and is unaffected by any Bun flag.
- The `bun check` shadowing trap is still a trap: writing
  `"typecheck": "bun check -p tsconfig.backend.json"` still type-checks
  nothing.

### 3.3 The unblock is no longer blocked by the escape hatch

> **Correction (2026-10-22).** This section originally concluded "the unblock
> is more expensive than the dependency", on the strength of §3.2's (falsified)
> claim that `bun --check` could not select a project. With `--tsconfig-override`
> in hand the premise is gone: the escape hatch reaches all three project
> tsconfigs with `tsgo`-equivalent error kinds. The options below are
> re-evaluated against the corrected §3.2.

The original argument was that switching to `bun --check` required either
renaming the `check` script or accepting a narrower gate set, because the
escape hatch could not select a project. That argument no longer holds: the
escape hatch *can* select a project, so the narrow-gate-set fallback is off the
table. What remains:

- **Rename the `check` script.** Still rejected, and now unnecessary for this
  purpose. `bun run check` is the canonical entry point in `AGENTS.md`
  (verification gates, scratchpad table, worktree section), `CONTRIBUTING.md`,
  the PR checklist, all six localized `README`s, and `docs/meta/**`. Renaming
  it to free a bun built-in name is a doc-contract change, not a
  `devDependency` change — and it is not needed, because `bun --check` (the
  leading-`--` escape hatch) is not shadowed and *does* take
  `--tsconfig-override`.
- **Commit a stub `package.json` without a `check` script** (e.g.
  `tooling/tscheck/`) and run the gates from there. Still rejected. Adds a
  confusing directory whose only purpose is to defeat name resolution, and
  buys nothing now that `--tsconfig-override` selects the project directly.
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

**Skipped: dropping `@typescript/native-preview`. The obstacle to dropping it
is no longer the escape hatch.** The remaining cost is rewiring three gate call
sites (`package.json` -> `typecheck`, `typecheck:frontend`, and
`scripts/check/parallel/gate-table.mjs` -> `typecheck - scripts`) from `tsgo` to
`bun --check --tsconfig-override=<project>`, which is a code change rather than
a dependency decision. Note also that the `typecheck - coverage*` gates are
*not* covered by that swap: they run `type-coverage`, which needs the TS5/TS6
compiler API (§2.2) and is untouched by any Bun flag. Add the drop when
`type-coverage-core` runs against the TS7 `./unstable/sync` API *and*
`typescript-eslint` lifts its peer ceiling — at that point `typescript@^7`
replaces both packages and no alias is needed.**

### 3.4 Adopted anyway: `bun --check` as a *complementary* gate

Not a replacement — at the time it landed, the analysis above ruled that out.
(§3.2 has since been corrected: `bun --check --tsconfig-override=<project>`
*can* select a project, so the escape hatch is no longer disqualified as a
replacement on capability grounds. What `bun --check` *does* have that no other
gate has is coverage of `tests/**`.)

Root `tsconfig.json` includes
`src/**` ∪ `tests/**`, and `tests/**` is type-checked by nothing:
`tsconfig.backend.json` is `src/**` minus `src/frontend/**`,
`tsconfig.frontend.json` is `src/frontend/**`, `tsconfig.scripts.json` is
`scripts/**`, and both `type-coverage` gates run against the backend/frontend
projects.

Measured by planting one TS2322 in `tests/__ts7probe.ts` and running every
typecheck gate:

| Gate | Result | Covers `tests/**` |
| --- | --- | --- |
| `typecheck - backend` (tsgo) | pass | no |
| `typecheck - frontend` (tsgo) | pass | no |
| `typecheck - coverage` (tsc) | pass | no |
| `typecheck - coverage - frontend` (tsc) | pass | no |
| `typecheck - scripts` (tsgo) | pass | no |
| `typecheck - bun` (`bun --check`) | **fail** | yes |

So `typecheck - bun` (`package.json` → `typecheck:bun` → `bun --check`) landed
as a blocking gate. It costs ~1.1s and rides along in `check:fast`; the tsgo
gates are unchanged and `typecheck - scripts` still needs its own project.

All dependency positions are unchanged — this adopts the `bun` binary that was
already the runtime, and drops nothing.

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
- **`bun --check` needs `--tsconfig-override` to select a project** — bare, it
  uses the nearest root `tsconfig.json` and so silently skips `scripts/**`.
  `bun --check --tsconfig-override=tsconfig.scripts.json` does cover it, and
  matches `tsgo`'s error kinds (§3.2). The first draft of this review claimed
  no project selection was possible at all; that was wrong.
- **`bun --check` is wired as the complementary `typecheck - bun` gate** for the
  `tests/**` coverage nothing else has (§3.4). Repointing the `tsgo` gates at
  it is a separate, unadopted change.
- **`tsgo` and `tsc` remain the unambiguous spellings** for a project-scoped
  check in this repo.
