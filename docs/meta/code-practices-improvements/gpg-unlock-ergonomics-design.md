# GPG Unlock Ergonomics — Design Note

## 1. Problem Statement

`scripts/worktree/commands/*` flows produce GPG-signed commits and merges (per repo policy in `AGENTS.md` L279-286, which forbids stripping signatures and treats unsigned commits on `dev` as a blocker). When `gpg-agent` has no cached passphrase for `AGENT_GPG_KEY_ID`, the agent blocks on `pinentry` waiting for user input — correct in interactive use, hostile in agent/CI flows where the prompt is never answered and the command hangs or fails opaquely.

The existing `scripts/gpg-unlock.mjs` helper is the canonical user-facing unlock command (prolongs TTL via `PRESET_PASSPHRASE` when the cache is warm; on cold cache, signs test data with `--pinentry-mode loopback` to populate the cache). It works, but it is **not wired into** every signing path. Several flows either:

- Skip the pre-check entirely (silent unsigned merge), or
- Pre-check the key but emit no actionable hint on failure, or
- Run `gpgMergeFlags`, which silently returns `[]` when the cache is cold and lets the merge proceed unsigned.

Net result: users see a successful merge/finalize that produced an **unsigned** commit, contradicting the documented signing policy.

## 2. Current Behavior — Per-Flow Audit

Verified against the actual source:

| Flow | File / Lines | Pre-check? | Hint on failure? | Verdict |
|---|---|---|---|---|
| `worktree commit` | `scripts/worktree/commands/commit.ts` L60-67 | yes (`gpg --list-secret-keys`) | yes (`run: ./scripts/gpg-unlock.mjs`) | OK |
| `worktree agent-commit` | `scripts/worktree/commands/agent-commit.ts` L79-86 | yes | yes | OK |
| `worktree sign` | `scripts/worktree/commands/sign.ts` L42-60 | yes (pre-check exists: `--list-keys` then `--list-secret-keys`) | no unlock hint — both errors are generic | **Fix needed** |
| `worktree merge` | `scripts/worktree/commands/merge.ts` L72 (call site) + `gpgMergeFlags` L10-23 | no — `gpgMergeFlags` silently returns `[]` when cold | no hint; merge proceeds **unsigned** | **Fix needed** |
| `worktree finalize --direct` | `scripts/worktree/commands/finalize.ts` L530 (call site) + `gpgMergeFlags` L155-168; post-merge verify at L549-559 | no — silent `[]` return | no hint on the failure; post-merge `git verify-commit` degrades to a `warn` only ("Merge commit not signed — GPG key may be locked") | **Fix needed** |
| `worktree finalize --squash` | `scripts/worktree/commands/finalize.ts` L473-476 | no — `git merge --squash` lacks `-S` / `commit.gpgsign` | no hint; unsigned squash | **Fix needed** |
| `worktree finalize --rebase` | `scripts/worktree/commands/finalize.ts` rebase branch (terminates at L465 "Rebased successfully"; integrate step is downstream) | n/a — no new commit created in the rebase itself | n/a | Safe |
| `bun run check` (gate runner) | `scripts/check-parallel.mjs` L162-168 (`runAllChecks`) | no — no GPG warm-up before the parallel check loop | n/a; the report runs, but a downstream `git commit` against cold cache will hang | **Fix needed (§7 step 9)** |
| `scripts/backup-sqlite.ts` | unrelated — `GPG_RECIPIENT` for file encryption (line 12, 65-70) | n/a | n/a | Out of scope |

## 3. Existing Helper — `scripts/gpg-unlock.mjs`

Verified against the actual source (134 lines):

- Reads `AGENT_GPG_KEY_ID` from `.credentials.env` (L31-49).
- **Warm path (`prolongCachedPassphrase`):** sends `PRESET_PASSPHRASE --preset <keygrip> -1 <hex_timestamp>` to `gpg-agent` via `gpg-connect-agent`, prolonging cache TTL to `max-cache-ttl` from `gpg-agent.conf` (default 7200s). No prompt, no signing.
- **Cold path (`warmCache`):** signs test data with `--pinentry-mode loopback` so `gpg-agent` can pull the passphrase from stdin and populate the cache.
- Exits non-zero on failure with a clear message.
- **Not imported by any `scripts/worktree/commands/*` flow.** Invoked by humans only.

## 4. Proposed Refactor — Single Shared Helper

Create `scripts/worktree/utils/gpg.ts` with two exports:

```ts
// scripts/worktree/utils/gpg.ts (sketch)
import { execFileSync } from "node:child_process";

export function assertGpgUnlocked(keyId: string): void {
  if (!keyId || !/^[A-F0-9]+$/i.test(keyId) || keyId.length < 8 || keyId.length > 40) {
    console.error(`hint: invalid-key`);
    console.error(
      `Invalid AGENT_GPG_KEY_ID '${keyId}'. Expected a 40-char (or 16/8-short) hex fingerprint.`
    );
    process.exit(1);
   }
   // (a) Is the key present in the keyring at all?
   try {
     execFileSync("gpg", ["--list-keys", keyId], { stdio: "ignore" });
   } catch {
    console.error(`hint: key-not-in-keyring`);
     console.error(
       `GPG key ${keyId} is not in the keyring. Add it via: gpg --import <path-to-secret.asc>` +
       `\n   or update AGENT_GPG_KEY_ID in .credentials.env`
     );
    process.exit(1);
   }
   // (b) Is the secret key reachable / unlocked?
   try {
     execFileSync("gpg", ["--list-secret-keys", keyId], { stdio: "ignore" });
   } catch {
    console.error(`hint: key-not-unlocked`);
     console.error(
       `GPG agent does not have ${keyId} unlocked. Run: bun run scripts/gpg-unlock.mjs`
     );
     process.exit(1);
   }
 }
```

### Distinguishing the two failure modes

- `gpg --list-keys <id>` fails → **config error** (key absent from keyring); user must `gpg --import` or fix `AGENT_GPG_KEY_ID`.
- `gpg --list-secret-keys <id>` fails after the public-key check passed → **operational error** (`gpg-agent` has not unlocked the secret); user must run `scripts/gpg-unlock.mjs`.

This split lets the hint match the actual remediation step.

## 5. Caller Refactor Table

| Caller | Current site | Action |
|---|---|---|
| `commit.ts` | L60-67 inline `gpg --list-secret-keys` | Replace with `assertGpgUnlocked(config.agentGpgKeyId)` |
| `agent-commit.ts` | L79-86 inline pre-check | Replace with `assertGpgUnlocked(credentials.keyId)` |
| `sign.ts` | L42-60 pre-check (no hint) | Replace with `assertGpgUnlocked(...)` — **gains hint** |
| `merge.ts` | L72 calls `gpgMergeFlags` (silent cold) | Insert `assertAgentGpgUnlocked()` **before** the L72 call site |
| `finalize.ts` direct | L530 calls `gpgMergeFlags`; post-merge `verify-commit` warn at L549-559 | Insert `assertAgentGpgUnlocked()` **before** L530; also fixes the post-merge `verify-commit` warning when an unsigned commit slipped through historically (L558: `"Merge commit not signed — GPG key may be locked"`) |
| `finalize.ts` squash | L473-476 `git merge --squash` | Insert `assertAgentGpgUnlocked()` **before** L473 **and** splice `gpgMergeFlags` (or equivalent `-S`) into the `git merge --squash` invocation so the squash commit is signed |
| `finalize.ts` rebase | (rebase branch in `finalize.ts`) | No change — no new commit |
| `agent-merge.ts` | 22-line alias to `finalize()` | Inherits fix from `finalize.ts` |

After this refactor, `gpgMergeFlags` may be reduced to a pure helper that assumes the cache is warm; the assertion is the gatekeeper.

## 6. Error UX Spec

Three failure-mode classes. All exit `1` with a `hint:` prefix line on stderr so a future programmatic consumer can branch on the hint without us shipping an exit-code taxonomy today.

### Config error — key missing from keyring

```
hint: key-not-in-keyring
GPG key ABCDEF1234567890… is not in the keyring.
Add it via: gpg --import <path-to-secret.asc>
   or update AGENT_GPG_KEY_ID in .credentials.env
```

Exit code: `1`.

### Operational error — secret key not unlocked

```
hint: key-not-unlocked
GPG agent does not have ABCDEF1234567890… unlocked.
Run: bun run scripts/gpg-unlock.mjs
```

Exit code: `1`.

### Invalid key id (malformed hex / empty)

```
hint: invalid-key
Invalid AGENT_GPG_KEY_ID ''.
Expected a 40-char (or 16/8-short) hex fingerprint.
```

Exit code: `1`.

## 7. Migration / Rollout — Ordered Steps

1. **Add `scripts/worktree/utils/gpg.ts`** with `assertGpgUnlocked` and `assertAgentGpgUnlocked`. No callers yet.
2. **Refactor `commit.ts`** — drop the inline pre-check, call the helper. (Behavior-preserving; already surfaced the hint.)
3. **Refactor `agent-commit.ts`** — same pattern.
4. **Refactor `sign.ts`** — call the helper. **Behavior change:** gains the unlock hint.
5. **Refactor `merge.ts`** — insert `assertAgentGpgUnlocked()` before L72 (`gpgMergeFlags` call site). **Behavior change:** fails loud on cold cache instead of producing an unsigned merge.
6. **Refactor `finalize.ts` direct branch** — insert `assertAgentGpgUnlocked()` before L530. **Behavior change:** same as merge.
7. **Refactor `finalize.ts` squash branch** — insert `assertAgentGpgUnlocked()` and splice signing flags into the squash commit so the resulting commit carries `-S`.
8. **Update `docs/worktree.md` / `AGENTS.md` snippet** — document the two-failure-mode UX and the `bun run scripts/gpg-unlock.mjs` remediation.
9. **Wire GPG warm-up into `scripts/check-parallel.mjs`** — before `runAllChecks()` spawns the parallel check array (L162-168), import `prolongCachedPassphrase` and `warmCache` from `scripts/gpg-unlock.mjs` (or a shared `scripts/lib/gpg-precheck.ts` that re-exports them) and run a single `await ensureGpgWarm()` step whose behavior depends on `MODE`:
   - `--ci` (and any non-TTY invocation): prolong-only via `PRESET_PASSPHRASE`. If `prolongCachedPassphrase(keyId)` returns `{ ok: false, reason: 'no-keygrip' | 'preset-rejected' | 'preset-threw' }`, log the operational hint (`Run: bun run scripts/gpg-unlock.mjs`) and `process.exit(1)` **before** any check subprocess is spawned. CI must not block on a pinentry prompt it cannot answer.
   - `--fix` / `--plain` on a TTY: try prolong first (silent, no prompt). On miss, fall back to `warmCache(keyId)` which inherits the user's loopback pinentry from the parent terminal — the user sees the prompt and can answer. If `warmCache` returns `false`, exit `1` with the operational hint.
   - Always log `gpg-precheck: warm (TTL ${maxTtl}s)` or `gpg-precheck: cold (no-keygrip; operator must run scripts/gpg-unlock.mjs)` on stderr so the report's provenance makes the cache state visible.
   - The warm-up MUST NOT alter `commit.gpgsign`, MUST NOT pass `-S none`, and MUST NOT add an opt-out flag — it only ensures the agent cache has the passphrase; the commit-side signing requirement is unchanged. This is consistent with `AGENTS.md` L279-286 ("never bypass" signing).

Steps 5–7 are user-visible behavior changes (cold-cache finalize now **fails loud** instead of producing an unsigned merge). Step 9 is the pre-flight gate change for `bun run check` itself. Both are intended fixes and align with `AGENTS.md` L279-286 ("never bypass" signing).

## 8. Backwards Compatibility

- **No `--allow-unsigned` escape hatch.** `AGENTS.md` L283-285: *"NEVER set `commit.gpgsign=false`, pass `-S none`, or otherwise strip the [signature]. An unsigned commit on `dev` is a blocker — reset it."* Permitting an opt-out would re-introduce the silent-unsigned class of bug and violate that policy. Operators who genuinely need to bypass signing should do it via `git config commit.gpgsign false` at the repo level — out of scope for this design.
- **No CLI flag changes** for `commit` / `agent-commit` / `sign` / `merge` / `finalize`; the helper is internal.
- **No changes to `scripts/gpg-unlock.mjs`** — it stays the human-facing unlock command.

## 9. Proposed Ticket

**Title:** `fix(worktree): assert GPG unlocked on every signing path; surface unlock command on failure`

**Priority:** high.

**Acceptance criteria:**



- `scripts/worktree/utils/gpg.ts` exports `assertGpgUnlocked(keyId)` and `assertAgentGpgUnlocked()`.
- All signing flows (`commit`, `agent-commit`, `sign`, `merge`, `finalize --direct`, `finalize --squash`) call the helper before any `git commit -S` / `git merge -S`.
- Cold-cache invocation of any signing flow exits non-zero with `hint: key-not-unlocked` followed by `Run: bun run scripts/gpg-unlock.mjs` on stderr.
- Missing-key invocation exits non-zero with `hint: key-not-in-keyring` followed by the `gpg --import` / `AGENT_GPG_KEY_ID` guidance on stderr.
- Malformed-keyId invocation exits non-zero with `hint: invalid-key` followed by the "Invalid AGENT_GPG_KEY_ID" message.
- `finalize --squash` produces a **signed** squash commit when run on a warm cache (`git log -1 --pretty=%G?` returns `G`).
- Unit + integration tests added (see §11).
- `scripts/check-parallel.mjs` runs a GPG warm-up before the parallel check loop: `bun run check` exits non-zero with the `gpg-unlock.mjs` hint in `--ci` mode when the cache is cold; on a TTY in `--plain` / `--fix` mode it falls through to loopback pinentry inherited from the parent. The `.tmp/check-report.json` provenance records the cache state (`warm` / `cold`).
- `AGENTS.md` L279-286 ("never bypass" signing) is unchanged; the warm-up only populates the agent cache and does not introduce any sign-stripping escape hatch.
- No `commit.gpgsign=false`, no `-S none`, no opt-out flag introduced.
## 10. Out of Scope

- Pinentry-mode selection (`loopback` vs `tty` vs `qt`) — `scripts/gpg-unlock.mjs` already handles the cold-path loopback fallback.
- `gpg-agent` daemon configuration (`default-cache-ttl`, `max-cache-ttl`, `allow-preset-passphrase` in `gpg-agent.conf`).
- Backup encryption via `scripts/backup-sqlite.ts` (`GPG_RECIPIENT` is unrelated — used for file encryption to a recipient, not signing).
- Cross-machine GPG key sync / secret sharing.
- SSH-based commit signing (`gpgsm`, `ssh-keygen -Y sign`) — repo policy is OpenPGP today.
- CI-side HSM / smartcard flows.

## 11. Test Plan

### Unit tests — `scripts/worktree/utils/gpg.ts`

| Case | Setup | Expect |
|---|---|---|
| Warm path, real key | real `gpg` available, secret key unlocked | helper returns; no exit |
| Cold path, locked key | secret key present in keyring, agent cache cold (kill `gpg-agent` first) | exit `1`, stderr starts with `hint: key-not-unlocked`, body matches `Run: bun run scripts/gpg-unlock.mjs` |
| Missing key | `--list-keys <unknown>` fails | exit `1`, stderr starts with `hint: key-not-in-keyring`, body mentions `gpg --import` and `.credentials.env` |
| Empty keyId | helper called with `""` | exit `1`, stderr starts with `hint: invalid-key`, body says `Invalid AGENT_GPG_KEY_ID` |
| Malformed keyId | helper called with `"not-hex"` | exit `1`, stderr starts with `hint: invalid-key` |
| Stub `gpg` binary | write a `bin/gpg` shim returning canned exit codes | verify each branch without a real keyring |

### Integration test — `finalize.ts` squash path, cold-cache

1. Stub `gpg` so `--list-secret-keys` returns non-zero but `--list-keys` succeeds.
2. Build two synthetic branches with one commit ahead.
3. Run `bun run scripts/worktree/commands/finalize.ts --squash --branch ...`.
4. Expect non-zero exit; expect stderr to contain `bun run scripts/gpg-unlock.mjs`.

### Integration test — `finalize.ts` squash path, warm cache

1. Stub `gpg` so both `--list-keys` and `--list-secret-keys` succeed.
2. Same setup as above; run finalize.
3. Expect zero exit; `git log -1 --pretty=%G?` returns `G` (good signature) on the resulting commit.

### Integration test — `finalize.ts` direct path, cold cache

1. Stub `gpg` so `--list-secret-keys` fails.
2. Run finalize with `--merge-strategy direct --force`.
3. Expect non-zero exit before any merge subprocess spawns; stderr contains the unlock hint.

### Pre-flight warm-up — `scripts/check-parallel.mjs` `ensureGpgWarm()`

| Mode | Setup | Expect |
|---|---|---|
| `--ci`, cold cache | stub `gpg-connect-agent` so `PRESET_PASSPHRASE` returns `ERR`; `.credentials.env` present | runner exits `1` **before** any check subprocess spawns; stderr contains `Run: bun run scripts/gpg-unlock.mjs`; `.tmp/check-report.json` either absent or written with `precheck: cold` provenance |
| `--ci`, warm cache | stub `gpg-connect-agent` so `PRESET_PASSPHRASE` returns `OK` | runner proceeds to the parallel check array; `.tmp/check-report.json` records `precheck: warm (TTL ${maxTtl}s)` |
| `--plain` on TTY, cold cache | stub `warmCache` to return `false` (e.g. `gpg --pinentry-mode loopback --sign` fails) | runner exits `1`; stderr contains the unlock hint; no silent skip |
| `--plain` on TTY, warm cache | stub `prolongCachedPassphrase` to succeed | runner proceeds; provenance records warm |
| `--plain` on non-TTY, cold cache | no PTY (e.g. piped from another command) | degrades to CI behavior: prolong-only, exit `1` if cold. No pinentry hang. |
| `commit.gpgsign=false` repo override | set via test repo | warm-up still runs (it does not gate on `commit.gpgsign`); document the rationale — the warm-up protects *future* signing flows, not just this runner |
| Stale `.tmp/check-report.json` from previous run | pre-warm with a previous report on disk | warm-up re-runs unconditionally; the report is overwritten at the end with current provenance |


## 12. Summary

Two complementary fixes close the cold-cache gap. **First** — `scripts/check-parallel.mjs` runs an `ensureGpgWarm()` pre-flight before the parallel check array (L162-168): under `--ci` it prolongs via `PRESET_PASSPHRASE` and refuses to start on cold cache, under `--plain` / `--fix` on a TTY it falls through to the existing loopback pinentry flow inherited from the parent terminal. **Second** — `scripts/worktree/utils/gpg.ts` exports `assertGpgUnlocked(keyId)` / `assertAgentGpgUnlocked()` and replaces the inline pre-checks in `commit`, `agent-commit`, `sign`, `merge`, `finalize --direct`, and `finalize --squash`. Together: every signing surface (the gate runner *and* the worktree CLI) either runs signed or exits non-zero with the `Run: bun run scripts/gpg-unlock.mjs` remediation on stderr. The `hint:` prefix on stderr distinguishes `key-not-in-keyring` / `key-not-unlocked` / `invalid-key` for any future programmatic consumer without burdening today's callers with an exit-code taxonomy. No `--allow-unsigned` escape hatch — `AGENTS.md` L279-286 ("never bypass" signing) is preserved verbatim. All line numbers cited in this note have been verified against the current tree at the cited file locations.