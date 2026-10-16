<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Repurpose dead sandboxed field into a strict-mode policy tag

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-security-sandboxing

**Summary:**

Make the unused plugin ToolDefinition.sandboxed field a policy tag that requires Bun =strict and refuses to run otherwise.

**Context:**

Verified 2026-10-15:

- `sandboxed` on `ToolDefinition` (`src/plugins/types.ts:112`) is **read nowhere in `src/`** — a dead field.
- `executePluginTool` (`src/plugins/tool-executor.ts:30-54`) is a `setTimeout` race only; it enforces `timeoutMs` (default `DEFAULT_TOOL_TIMEOUT_MS = 30_000`) and converts a throw into an `isError` result via `jsonStringifyOr`.
- Community plugins land disabled by default (`config-store.ts:53-55`, `loader.ts:259-260`; tests `loader.test.ts:305,719`, `config-store.test.ts:38-40`).

So today **no plugin-tool sandbox exists at all**. Bun 1.4.3's `=strict` fixes the one escape hatch an arbitrary-code tool would actually use: Node's `--disallow-code-generation-from-strings` was previously accepted-and-ignored, and now covers the whole process including every `Worker`. `=strict` also blocks `node:vm`, `data:` URL imports, `new Worker(code, {eval:true})`, and `module._compile()`.

But `=strict` is **not a filesystem or network boundary**. So `sandboxed` must not be revived as a boolean or presented as a sandbox — it becomes a typed policy **tag** whose strongest honest claim is "requires `=strict`".

Also relevant: `Bun.ModuleGraph` is explicitly labelled experimental and states plainly *"It is not a security sandbox"* — it gives memory isolation without request routing. Record it in the epic as the future isolation primitive, gated on leaving `experimental`; do not build on it now.

**Acceptance Criteria:**

- [x] **Behaviour:** `sandboxed` is read by the tool path and becomes a typed policy tag rather than a boolean; its docs claim is exactly "requires `=strict`".
- [x] **Behaviour:** a policy tagged as requiring `=strict` refuses to run when the process was not started with it, and the refusal is a typed error naming the missing flag.
- [x] **Tests:** tagged tool refused without `=strict`; same tool accepted with `=strict`; untagged tool unaffected.
- [x] **Edge cases:** a community plugin (disabled by default) carrying a tag; a tag set against an older Bun that lacks the flag; nested plugin tool invocation; a plugin loaded before the policy is installed.
- [x] **Security:** the field must not be presented in docs, UI, or types as a sandbox — a test or assertion pins that the documented claim is the flag requirement, not isolation.
- [x] **Security:** `=strict`'s coverage is verified by an executed check, not assumed — string-to-code escape (`eval`, `new Function`, `node:vm`, `data:` import) is blocked under the flag.
- [x] **Concurrency / TOCTOU:** a plugin loaded *before* the policy is installed must not inherit an implicit pass — the policy is re-evaluated at invocation time, or the load is refused outright. A plugin that gains a tag after a cached decision must not keep the cached decision.
- [x] **Regressions:** community-plugin-disabled-by-default tests unchanged (`loader.test.ts:305,719`, `config-store.test.ts:38-40`).
- [ ] **Repo gates:** `bun run check` green. **NOT MET** — see "Gate status" in Notes: the one failing gate (`changelog - gate`) is pre-existing on dev and provably independent of this branch.

## Notes

### Gate status — `bun run check` is NOT green

Full run (run id `226199-mvarknwl`, exit 1): **Total 41 | Passed 35 | Skipped 1 |
Advisory 4 | Failed 1.** Verbatim summary:

```
=== Summary ===
Total: 41
Passed: 35
Skipped: 1
Advisory: 4
Failed: 1

!!! ADVISORY FAILURES: 4 — NOT a clean run.
=== 1 check(s) failed ===
error: script "check:parallel" exited with code 1
```

**The one FAILING gate is `changelog - gate`:

```
FAIL: changelog - gate
  - latest tag 1.2.3 has no CHANGELOG section - update CHANGELOG.md before tagging
```

Proven **pre-existing on dev and not caused by this branch**: the gate reads
exactly two inputs — `CHANGELOG.md` on disk and the repo-global `git tag` list —
neither of which this branch touches. `git diff dev -- CHANGELOG.md` is empty
(byte-identical to dev), and `bun run scripts/check-changelog.ts` reproduces the
same failure standalone. The branch adds 43 commits' worth of lineage over tag
1.2.3, of which only 3 are this ticket's.

**Advisory (non-blocking) gates, 4 — 2 were caused by this branch and are now fixed:**

- `code-map - freshness` — **was mine** (new `tool-policy.ts` +
  `strict-probe.fixture.ts` absent from the map). Fixed: `giwt plan code-map`
  regenerated it (+30 lines); now reports "OK - code map is up to date".
- `plan - validate` — **was mine**, failing only via the same stale code-map.
  Now `code-map OK`; its one remaining failure is the pre-existing
  "ticket index out of sync".
- `dead - code (src files)` — pre-existing: 69 unused files, verified that
  neither new file of mine is among them.
- `plan - ticket index (sync)` — 3 actionable (263 advisory). 2 of the 3 status
  mismatches pre-date this branch (`BUG-schema-version-table-...`,
  `TASK-egui-sse-response-streaming-...`); `giwt sync --fix` propagated those
  two registry-driven closes into their `.md` files. The third is this ticket's
  own entry, which has no git issue to reconcile against.

**Pre-existing test-suite state:** 28 order-dependent failures in
`src/frontend/alpine` reproduce at baseline with the `src/plugins` changes
stashed, and pass in isolation — a suite-ordering leak, not a regression from
this ticket.

**Gates that DO cover this ticket and pass:** typecheck (backend, bun, frontend,
coverage, scripts), lint - eslint, lint - native, format - dprint, size - check,
size - strict, tests - coverage gaps, coverage - per-module line %,
wiring - check, db - schema gate, migrations - ordering, e2e - browser (baseline).

**Flag name corrected.** `=strict` in the ticket body is shorthand for
`--disallow-code-generation-from-strings=strict`, which is what Bun's
`code-generation-from-strings` docs actually specify. The bare
`--disallow-code-generation-from-strings` (no value) is the Node-compatible
level: it refuses `eval`/`new Function` but leaves `node:vm` and run-time
`data:` imports open. `isStrictCodegenActive` requires the exact `=strict`
spelling, and a test proves the distinction by executing both.

**What landed.**

- `src/plugins/tool-policy.ts` — the tag type, `STRICT_CODEGEN_FLAG`,
  `STRICT_CODEGEN_CLAIM`, `isStrictCodegenActive`, `ToolPolicyError`, and
  `assertToolPolicySatisfied`.
- `ToolDefinition.sandboxed?: boolean` → `policy?: ToolPolicyTag`. No other
  field was renamed and no caller needed migrating: nothing read `sandboxed`.
- `executePluginTool` calls `assertToolPolicySatisfied(tool)` as the first
  statement inside its existing `try`, so a refusal lands on the same
  `{ error }` / `isError` contract every other tool failure already uses.
- `src/plugins/strict-probe.fixture.ts` — a spawned script reporting what the
  gate and the runtime actually did, for four scenarios (`gate`, `nested`,
  `mutate`, `coverage`).
- `src/plugins/tool-policy.test.ts` and one `loader.test.ts` case.

**Coverage is executed, not asserted from docs.** The `coverage` scenario runs
the four escapes in a real Bun process started both with and without the flag,
and the test asserts all four flip from `allowed` to `refused`. Without the
flag all four are open, which is what makes the flagged assertion meaningful.

**TOCTOU.** The gate is re-read from `process.execArgv` on every invocation and
nothing is memoised. The `mutate` scenario invokes an untagged tool, sets its
tag, and invokes again — the second call is refused, so the first decision left
nothing behind. No load-time check was added: refusing at load would only move
the TOCTOU window, not close it.

**Older Bun.** A runtime predating the flag cannot list it in `process.execArgv`,
so it is never read as satisfying the policy. Tested via the `execArgv` seam
rather than by downgrading Bun.

**Community plugin.** Covered in `loader.test.ts`: the plugin lands disabled,
and after an explicit enable its tagged tool is still refused — the disabled
default is not what makes the tag hold.

**End-to-end through the generation loop.** `tool-execution.test.ts` registers a
tagged tool, drives it through `executeToolCalls`, and asserts the refusal
arrives as a tool result naming the flag with the handler never invoked — so the
gate is proven on the real tool path, not only at the executor.

**The tests were checked for teeth by sabotage, not trusted because they pass.**
Deleting the `assertToolPolicySatisfied(tool)` call makes the end-to-end test
fail (`invoked` flips to `true`), and memoising the decision inside
`assertToolPolicySatisfied` — exactly the TOCTOU bug this ticket calls out —
makes the `mutate` scenario fail. Both were run and both failed as required,
then reverted. A passing test here is not self-evidently evidence.

**Worker inheritance verified by execution.** The module JSDoc claims `=strict`
cannot be lowered in a Worker. Verified rather than assumed: a file-based Worker
inherits the refusal (`ALLOWED` unflagged vs `REFUSED:EvalError` flagged), and
`new Worker(code, { eval: true })` throws outright under the flag.

**Future isolation primitive (not built).** `Bun.ModuleGraph` is explicitly
experimental and states plainly that it is not a security sandbox. It offers
memory isolation without request routing. Recorded in the epic as the future
direction, gated on leaving `experimental`.

**Resolved:** 2026-10-16 registry-driven close: git issue 94a4e81 (registry tip: befaf43d6 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-REPURPOSE-DEAD-SANDBOXED-FI)
