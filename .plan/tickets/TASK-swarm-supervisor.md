<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Swarm Supervisor — generalize ServerExternalManager

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-local-process-swarm
**Related:** (none yet)

## Summary

Extract a Bun-written process supervisor (`src/swarm/`) that generalizes
`ServerExternalManager` from "external AI servers" to "managed loop-lore sub-apps", with
manifest-driven allocate/deallocate, process-group kill, and health probes. Backbone of
`epic-local-process-swarm`.

## Context

`ServerExternalManager` (`src/services/server-external-manager/`) already spawns
llama.cpp/sd.cpp/llama-swap via `bun:spawn` with a start/health/stop lifecycle and liveness
probes. But it:

- (a) kills only the direct child PID (`src/services/server-external-manager/lifecycle.ts:15-21`,
  and `killAllSync` at `:44-52`) — **reproduced orphan**: grandchild survives child kill
  (blocking finding B6);
- (b) is instantiated inside the monolith `start()`;
- (c) has no manifest / allocate–deallocate API.

The local-process-swarm epic needs this as its supervisor backbone. A `core` process plus
on-demand workers (static, generation, job) are spawned and managed by it; the external
inference servers are folded into the same supervisor.

## Acceptance Criteria

- [ ] `src/swarm/` supervisor with manifest `{ name, entry, ports, healthUrl, minReplicas, maxReplicas, allocPolicy }`
- [ ] Spawn uses a **process group**; kill uses `process.kill(-pgid, signal)` — verified no orphan (fixes B6)
- [ ] Health probes reused from `server-external-manager/probes.ts`
- [ ] `allocate(name)` / `deallocate(name)` API honoring min/max replicas + `allocPolicy`
- [ ] `allocPolicy` = scale-down on idle/triggerability → scale-up on incoming **legitimate** load (not DDoS, not rate-limitable) → gated by GPU-colocation (LLM/SD) then cpu+load+ram; defined in epic `epic-local-process-swarm`
- [ ] External-inference (llama.cpp/sd.cpp/llama-swap) folded into the same supervisor
- [ ] Supervisor `exit` kills the whole process group
- [ ] Unit tests: spawn, process-group kill, probe, allocate/deallocate
- [ ] `bun run check` green

## Files

- `src/swarm/` (new): `supervisor.ts`, `manifest.ts`, `lifecycle.ts` (process-group),
  `probes.ts`
- `src/services/server-external-manager/` (fold into `src/swarm/` or re-export)
- `src/server/start.ts` (delegate bootstrap to the supervisor)

## Dependencies

- `epic-local-process-swarm` (B1, B6, V1)
