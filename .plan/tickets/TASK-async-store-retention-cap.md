<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# async-store retention: cap OFFLOAD_DIR by age + bytes

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task

**Summary:** The runtime async-store spill directory (`OFFLOAD_DIR` = `.tmp/async-store/`, exported from `src/async/spill.ts:12`) has **no delete path** — only a write path (`spill()`, `src/async/spill.ts:24-33`). Phase 3 of `runOffloadPass` (`src/async/offload.ts`) unlinks a file when its parent `request_results` row transitions to `expired`, but that depends on the eviction sweep actually firing and on rows making it to the `expired` state; nothing reaps orphans, fixtures, or rows that linger past TTL. Result: the directory grows monotonically across runs.

Add a pure `retainSpillDir({ maxBytes, maxAgeDays })` helper in `src/async/spill.ts`, expose config (`config.asyncStore.retention = { maxBytes, maxAgeDays }`, defaults `100 MB` / `7 days`), and wire it into the existing daemon loop (`startOffloadDaemon` -> `runOffloadPass` path). The helper must be callable from any scheduler (the in-tree `setInterval` daemon **and** the cron-shaped replacement ticket `TASK-adopt-elysiajs-cron-for-scheduled-tasks.md`), so it is defined as a pure function with no scheduler coupling.

## Current state

- **Code** (`src/async/spill.ts`, all paths read at source 2026-09-26):
  - `OFFLOAD_DIR = path.resolve(".tmp", "async-store")` (`:12`)
  - `spill(id, body)` writes `${id}.json.gz` (`:24-33`)
  - `offloadDiskBytes()` returns total `*.json.gz` bytes under `OFFLOAD_DIR` (`:63-75`) — read-only, no delete
  - No `unlinkSync`, `rmSync`, or `readdir`+age-sort anywhere in `src/async/spill.ts`
- **Config** (`src/async/store.ts:73-80`):

  ```
  interface AsyncStoreConfig {
    maxInlineBytes?: number;
    defaultTtlMs?: number;
    queueLimit?: number;
  }
  ```

  No retention fields. `src/config/schema/` has no `asyncStore` section either — the `AsyncStoreConfig` type is the live schema and is currently passed through without a config-layer mirror.
- **Evidence, current state (verified 2026-09-26):**
  - `.tmp/async-store/` = **279 files / 18 MB** (per `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §1 P-03 row, revision 2)
  - Oldest live file: **2026-09-10** (16 days, scratchpad §7 row 8 corrected from the 20-day draft)
  - Phase 3 (`src/async/offload.ts:124-133`) is the only delete path and it requires `status = 'expired'` in the WHERE clause — pure orphans (crashed processes, killed tests, expired rows whose evictions were skipped) accumulate indefinitely.
- **Evidence, leak rate (`.tmp/scratchpad-audit/e2e-matrix2.txt`, both arms canonical `--parallel=4 --isolate`):**

  ```
  == A: canonical, safeguard UNSET ==
    29 fail  Ran 277 tests across 33 files. [3.51s]
      spill files: 285 -> 286 (delta +1)
  == B: canonical, E2E_SAFEGUARD=1 ==
    0 fail  Ran 277 tests across 33 files. [3.62s]
      spill files: 286 -> 288 (delta +2)
  ```

  Both arms leak files even when passing (B leaks 2, A leaks 1). The leaked files are mostly test fixtures with no per-test override of `OFFLOAD_DIR` (D-03 is a parallel ticket — see Notes) plus a handful of `request_results` rows whose eviction pass never fired.

## Proposal

1. **Pure helper in `src/async/spill.ts`** — signature:

   ```ts
   export interface RetainOpts {
     /** Max bytes under OFFLOAD_DIR; 0 disables the bytes cap. */
     maxBytes: number;
     /** Drop files whose mtime is older than `now - maxAgeDays * 86_400_000`; 0 disables the age cap. */
     maxAgeDays: number;
     /** Database handle for parent-row lookup; pass `undefined` to skip parent-row drops. */
     database?: Kysely<DB>;
     /** Now override (test seam). */
     now?: number;
   }
   export interface RetainResult {
     bytesBefore: number;
     bytesAfter: number;
     droppedByAge: number;
     droppedByParentGone: number;
     droppedByBytes: number;
   }
   export function retainSpillDir(opts: RetainOpts): RetainResult;
   ```

   Algorithm:
   - `readdirSync(OFFLOAD_DIR)` (flat — no recursion, matching `offloadDiskBytes`).
   - For each `*.json.gz` file: read `statSync` -> record `{ name, size, mtimeMs, requestId = name.replace(/\.json\.gz$/, "") }`.
   - **Phase A (parent gone):** when `database` is supplied, look up `requestId` in `request_results` (SELECT id WHERE id = ?); drop the file on cache miss. Skipped when `database` is `undefined`.
   - **Phase B (age):** drop files where `now - mtimeMs > maxAgeDays * 86_400_000`. Always runs when `maxAgeDays > 0`.
   - **Phase C (bytes):** drop oldest-first (by `mtimeMs` ascending) until `bytesAfter <= maxBytes`. Runs when `maxBytes > 0` and phase A/B did not bring us under cap.
   - Unlink failures are caught and logged (matching `offloadDiskBytes`'s `try { ... } catch { /* raced */ }` convention) — never throw out of `retainSpillDir`.
2. **Config schema** — extend `AsyncStoreConfig` (`src/async/store.ts:73`):

   ```ts
   retention?: {
     maxBytes?: number;   // default 100 * 1024 * 1024  (100 MB)
     maxAgeDays?: number; // default 7
   };
   ```

   No `src/config/schema/` mirror needed for v1 (the type is the live schema); add a one-line comment in `src/config/schema/index.ts` noting the live type lives at `src/async/store.ts:73` so future mirroring is straightforward.
3. **Wire into daemon** — extend `startOffloadDaemon` (`src/async/offload.ts:172-228`) to accept the new config and run `retainSpillDir` **after** `runOffloadPass` completes each tick. The phase ordering matters: phase 1 of `runOffloadPass` may have just spilled a new file, so retention MUST run after it. Schedule: same interval (`DEFAULT_INTERVAL_MS = 5 min`) as offload; on first tick after startup, run a retention pass immediately so a fresh process doesn't inherit months of leftovers. The interval field is reused — no new scheduler needed.
4. **Wire into cron ticket** — `TASK-adopt-elysiajs-cron-for-scheduled-tasks.md` lists "telemetry retention enforcement" as one of the cron jobs to migrate. This ticket does not depend on that one landing first: `retainSpillDir` is the pure helper; the cron ticket can wire it as a cron expression once `@elysiajs/cron` lands, and the daemon wiring here keeps retention running in the meantime.
**Context:** Filed via giwt template lacking required bold sections; normalized 2026-09-26 during the mock-isolation migration finalize.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification executed green
