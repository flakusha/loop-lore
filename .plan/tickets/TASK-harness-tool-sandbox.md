<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness tool-call sandbox (worker isolation)

**Status:** Not Started
**Priority:** high
**Effort:** Very High
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Production isolation for plugin/assistant tool execution (worker/vm/subprocess + timeouts + capability-scoped ctx). A hostile or buggy community-plugin tool can today crash or exfiltrate from the server process.
**Context:** Tools execute in-process with zero isolation (`worker_threads|Worker(|vm.run|child_process|Bun.spawn|spawnSync|execFile` zero hits across `src/plugins` + `src/assistant` + `src/generation/tools`; only `Bun.spawnSync` in `src/config/cert.ts` for openssl). Test isolation (`test-utils/isolate-only.ts`, `--isolate` partitioning) is test-only. hermes Footprint Ladder + session-scoped toolsets + `check_fn` gating is the policy shape; `executePluginTool` 30s race is the timeout precedent.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Tool execution moves behind an isolation boundary (worker thread default; vm/subprocess for untrusted origins) with timeout kill + capability-scoped ctx (tool sees only its declared inputs + leased credentials, never the server process env).
- [ ] Origin-tiered policy: core/builtin (in-process, keep), community/local (isolated), third-party skills (isolated + capability-denied network/fs by default). Reuses `registry-policy.ts` origin taxonomy.
- [ ] Timeout + OOM kill recorded as `harness.call_completed` error category; parent run survives worker death (no server crash).
- [ ] Unit + fault-injection tests: kill on timeout, secret non-leakage across boundary, crash containment. Policy neighbor: `epic-security-sandboxing.md` — cross-link, no duplicate threat model.

## Related Files

- `src/plugins/tool-executor.ts`, `registry-policy.ts`, `src/generation/generate-route/tool-execution.ts`
- `epic-security-sandboxing.md`, `epic-plugin-system.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 13bfecb
