# Audit Report: Batch B

**Auditor:** audit-batch-B strict re-review
**Branch:** dev
**Commits audited:** c77aa744 2f5c5f17 6e267240 f2deabc5 6ef3663a d13f6078 7aa33f8b 8b3656db 3f640da9
**Post-batch patches on dev:** e0121860 (fixes 8b3656db m bug) 0676e1c8 (GpgHint unexport)

---

FINDING 1: HISTORICAL critical — m undefined in ensureGpgWarm
Commit: 8b3656db (introduced) then e0121860 (patched 2 commits later on dev)
Severity: critical at time of 8b3656db; patched on dev
Type: regression-risk

Evidence chain:
- `git show 8b3656db:scripts/check-parallel.mjs | sed -n 170-180p`: `const keyId = m?.[1]?.trim()...` — no `const m =` in scope
- `git show e0121860`: +1 line adding `const m = /^AGENT_GPG_KEY_ID\s*=\n  \s*["']?([^"'\n]*)["']?/m.exec(content);` before keyId line
- `git log --oneline dev | grep e0121860`: e0121860 is 2nd commit after 8b3656db on dev
- Ticket file exists: `.plan/tickets/BUG-check-parallel-gpg-preflight-crashes-on-undefined-m.md`
  (status: Not Started, not in index.json — orphaned ticket)

Confirmed behavior:
- `m === undefined` -> `keyId === ""`
- CI/non-TTY: `isCi === true` -> immediate `process.exit(1)` — confirmed via code trace
- TTY path: `warmCache("")` calls `gpg --local-user ""` — GPG behavior with
  empty string is **not verifiable from source alone**; gap explicitly noted

Import wiring: `scripts/check-parallel.mjs` line 46 imports `prolongCachedPassphrase, warmCache`
from `./gpg-unlock.mjs` — both exported at gpg-unlock.mjs:123; wiring verified

Blocking: NO — patched on dev by e0121860
Suggested: Orphaned ticket not in index.json — register it or close it; no test added by e0121860
Related: BUG-check-parallel-gpg-preflight-crashes-on-undefined-m.md (file exists; not in index)

---

FINDING 2: MEDIUM — d13f6078 introduced reapStale():void; 7aa33f8b fixed to boolean
Commit: d13f6078 (introduced void) then 7aa33f8b (fixed boolean — same batch)
Severity: medium at time of d13f6078; patched on dev
Type: regression-risk

Evidence chain:
- `git show d13f6078:scripts/worktree/commands/finalize.ts | grep reapStale`:
  `(): void =>`
- `git show 7aa33f8b:scripts/worktree/commands/finalize.ts | grep reapStale`:
  `(): boolean =>`
- Current dev (line 105): `(): boolean =>` — confirmed via read tool
- `git log 7aa33f8b..8b3656db -- scripts/worktree/commands/finalize.ts`:
  8b3656db inherits the fix

Behavior in d13f6078: void return -> `if (undefined)` always falsy -> early return
never fires; 20ms sleep always executes; lock correctness unaffected

Full negative space review:
- Lock only in `finalize.ts`; no other script uses `.worktree-finalize.lock`
  (grep across all .ts/.mjs/.js confirmed; empty result)
- `releaseFinalizeLock()` in `finally` block (lines 382-387) — always releases
- `checkDevMergeable()` before `acquireFinalizeLock()` (lines 381-382) — precheck first
- `try/finally` around `runFinalize()` — no lock leak path

Blocking: NO — fixed on dev by 7aa33f8b
Suggested: Acknowledge as historical
Related: BUG-finalize-concurrent-merge-race

---

FINDING 3: LOW — templates.ts at 190L 1 line under AGENTS.md 200-line ceiling
Commit: 2f5c5f17
Severity: low
Type: follow-up

Evidence: `wc -l src/config/schema-class/json-schema/templates.ts` -> 190
No size-allow directive; 5 sub-sections + 3 const helpers; any addition pushes over

Blocking: NO
Suggested: Monitor; add size-allow:200 if file grows
Related: BUG-config-schema-emitter-missing-top-level-sections

---

FINDING 4: LOW — name field absent from check-report.json per-check entries
Commit: 8b3656db
Severity: low
Type: missed-test

Evidence chain:
- `git show f2deabc5:scripts/check-parallel.mjs | sed -n 310-315p`:
  OLD code has `name: check.name,` in checks.map() return
- `git show 8b3656db:scripts/check-parallel.mjs | sed -n 383-395p`:
  `name` removed; only `command` present
- `git show 8b3656db..HEAD -- scripts/check-parallel.mjs | grep 'name:'`:
  no re-addition found
- Current dev (lines 389-396, verified via read tool): `name` absent
- `find . -name '*.test.*' | xargs grep 'check-report' 2>/dev/null`:
  empty — no test exists for report schema

Blocking: NO
Suggested: Confirm intentionality; add name:check.name back; add schema-validation test
Related: BUG-fix-worktree-assert-gpg-unlocked-on-every-signing-path-surfa

---

CLEAN: c77aa744 — DATA_DIR placeholders verified; check-schemas passes on dev
CLEAN: 6e267240 — 48 files with size-allow verified; danger-zone.test.ts formatting only
CLEAN: f2deabc5 — Promise.allSettled chunked scheduler verified; duplicate ESLint removed
CLEAN: 6ef3663a — index.json sync mechanically correct; 4 tickets marked done
CLEAN: d13f6078 — checkDevMergeable acquireFinalizeLock restoreDevFromStash verified;
  introduced FINDING 2; .worktree-finalize.lock added to .gitignore
CLEAN: 7aa33f8b — reapStale void->boolean only change confirmed
CLEAN: 8b3656db worktree GPG parts — assertAgentGpgUnlocked/assertGpgUnlocked
  wired correctly; gpg.ts correct; 0676e1c8 only touches knip.json and gpg.ts
CLEAN: 3f640da9 — knip --no-progress fix verified; jscpd patterns verified;
  research dir gitignored

---

## Summary

| # | Commit | Severity | Type | Status |
|---|--------|----------|------|--------|
| 1 | 8b3656db->e0121860 | critical | regression-risk | HISTORICAL — patched; ticket orphaned (not in index) |
| 2 | d13f6078->7aa33f8b | medium | regression-risk | HISTORICAL — fixed on dev |
| 3 | 2f5c5f17 | low | follow-up | Monitor templates.ts |
| 4 | 8b3656db | low | missed-test | Non-blocking |
| 5-12 | all others | — | CLEAN | — |

4 findings; 0 blocking. No action required for current dev.
