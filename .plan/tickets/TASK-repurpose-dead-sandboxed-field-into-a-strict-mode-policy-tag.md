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
- [x] **Repo gates:** `bun run check` green.

## Notes

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

**Future isolation primitive (not built).** `Bun.ModuleGraph` is explicitly
experimental and states plainly that it is not a security sandbox. It offers
memory isolation without request routing. Recorded in the epic as the future
direction, gated on leaving `experimental`.
