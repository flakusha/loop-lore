<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Close multi-instance H18 path hygiene

**Status:** In Progress
**Ruling:** Wontfix (no independent H18 requirement; see Ruling section)
**Scope:** Close H18 instance path hygiene leg
**Priority:** medium
**Effort:** Small

**Summary:**

Close the H18 leg of multi-instance path hygiene, which the F18/H4/H5 closeout ticket does not cover.

**Context:** TASK-instance-path-hygiene-close-f18-h4-h5 names F18, H4 and H5 only. Repo-wide search finds no H18 ticket or plan reference.

**Acceptance Criteria:**

- [x] H18 requirement restated from the original hygiene audit.
- [x] Implementation or explicit Wontfix ruling with rationale.
- [x] Test or documented verification for the resulting path behavior.

**Caveats:** TOCTOU: instance paths resolve at boot. Security: paths must remain instance-scoped. Authorization: operator controls instance config. Parallelism: isolated config test. Partial failure: retain current path behavior and report. Rollback: revert the change. Observability: boot log records resolved paths.

## Restatement from evidence (2026-11-19)

"H18" has no entry in the original hygiene audit. `.tmp/research/00-federation-review-index.md:22`
enumerates the finding series: `F1..F18` = report 01 (`.tmp/research/01-multi-instance-state-isolation.md`)
and `H1..H17` = report 03 (`.tmp/research/03-harness-federation-vcs.md`). There is no H18 in either
series; grep for `H18` across `.tmp/research/` returns zero matches. The label was coined later by the
1.0.0 followup audit: `.tmp/intercom/PROGRESS.md:264` files "H18 path hygiene" as a polish/required
followup, and `.tmp/intercom/PLAN-next-followups-2026-11-19.md:54` names this ticket with no source
finding. This ticket's original wording (commit `faf8c3050`) is: "Close the H18 leg of multi-instance
path hygiene, which the F18/H4/H5 closeout ticket does not cover" / "Repo-wide search finds no H18
ticket or plan reference" — the absence is real, not an incomplete search.

Substance the label can honestly point at is the open portion of the instance-hygiene gap table,
`.tmp/intercom/plan-wave/09-instance-hygiene.md:35-37`: F18 (bare `PORT` still doubles as the slug
input — `packages/core/src/config/state-dir.ts:148,159-165`), H4 (`system_config` overrides are global
rows — `src/admin/config.ts:47-48`), and H5 (harness permission queue is a process-local `Map` —
`src/integrations/harness/permission-queue.ts:106-113`). The direct path-escape finding F4
(`.tmp/research/01-multi-instance-state-isolation.md:174-209`) and F10-F12/F17/F13-H12/doc/jj-pijul
are already closed (`09-instance-hygiene.md:27-34`).

Restated requirement: every default runtime path (DB, uploads, TLS material, backups, exec log)
resolves under the per-instance state dir; no instance inherits a path from process cwd, a bare
`PORT`, or a repo-sibling shared location.

## Ruling: Wontfix

- No independent requirement exists to implement: the audit series stops at F18/H17. "H18" is a
  filing label, not a finding, so there is no missing path behavior unique to this ticket.
- Every substantive item is already owned. F18/H4/H5 are explicitly bundled into
  `TASK-instance-path-hygiene-close-f18-h4-h5` (`09-instance-hygiene.md:41-48`; that ticket is Not
  Started in this tree). Implementing them here would duplicate that ticket and risk conflicting with
  its owner.
- F4 — the real "paths escape the instance dir" defect — is already fixed on this tree:
  `configs/config.assets.example.toml:6` and `configs/config.server.example.toml:10-11` ship the
  overrides commented out, with `${DATA_DIR}` defaults; `src/assets/service/file-system.ts:28-41`
  re-anchors `${DATA_DIR}` onto the runtime instance dir and rejects forbidden system roots.
- The governing rule "all paths instance-scoped, no global fallbacks" is already enforced by the
  resolver and documented in the owned ticket; this lane adds no fallback and touches no runtime path.

## Verification (documented)

Commands run in `tree/h18-path-hygiene` on 2026-11-19:

- `bun test packages/core/src/config/state-dir.test.ts src/assets/service/file-system.test.ts` →
  `63 pass / 0 fail` (2 files, 18 ms). Covers slug precedence, `..` sanitisation, port-0 fail-loud,
  and upload path containment.
- `bun run typecheck` → `tsgo --noEmit --project tsconfig.backend.json`, EXIT 0 (config/boot clean).
- Two-instance probe (`.tmp/h18-path-probe.ts`, untracked scratch) — distinct DB/upload/cert roots per
  instance, all under the instance dir, no global fallback:

  ```
  alpha {"dir":"/tmp/h18-state/alpha","db":"/tmp/h18-state/alpha/loop-lore.db","upload":"/tmp/h18-state/alpha/uploads","cert":"/tmp/h18-state/alpha/certs/key.pem"}
  beta  {"dir":"/tmp/h18-state/beta","db":"/tmp/h18-state/beta/loop-lore.db","upload":"/tmp/h18-state/beta/uploads","cert":"/tmp/h18-state/beta/certs/key.pem"}
  ```

Residual: F18/H4/H5 stay open under their own ticket (out of scope here). No full `bun run check` —
lane scope asks for the narrowest meaningful verification only.
