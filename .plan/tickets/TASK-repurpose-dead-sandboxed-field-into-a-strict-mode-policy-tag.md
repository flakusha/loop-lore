<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Repurpose dead sandboxed field into a strict-mode policy tag

**Status:** Not Started
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

- [ ] **Behaviour:** `sandboxed` is read by the tool path and becomes a typed policy tag rather than a boolean; its docs claim is exactly "requires `=strict`".
- [ ] **Behaviour:** a policy tagged as requiring `=strict` refuses to run when the process was not started with it, and the refusal is a typed error naming the missing flag.
- [ ] **Tests:** tagged tool refused without `=strict`; same tool accepted with `=strict`; untagged tool unaffected.
- [ ] **Edge cases:** a community plugin (disabled by default) carrying a tag; a tag set against an older Bun that lacks the flag; nested plugin tool invocation; a plugin loaded before the policy is installed.
- [ ] **Security:** the field must not be presented in docs, UI, or types as a sandbox — a test or assertion pins that the documented claim is the flag requirement, not isolation.
- [ ] **Security:** `=strict`'s coverage is verified by an executed check, not assumed — string-to-code escape (`eval`, `new Function`, `node:vm`, `data:` import) is blocked under the flag.
- [ ] **Concurrency / TOCTOU:** a plugin loaded *before* the policy is installed must not inherit an implicit pass — the policy is re-evaluated at invocation time, or the load is refused outright. A plugin that gains a tag after a cached decision must not keep the cached decision.
- [ ] **Regressions:** community-plugin-disabled-by-default tests unchanged (`loader.test.ts:305,719`, `config-store.test.ts:38-40`).
- [ ] **Repo gates:** `bun run check` green.
