<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TLS missing OpenSSL friendly error on boot

**Status:** Done
**Priority:** low
**Effort:** Small
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Make TLS boot fail with an actionable message when OpenSSL is missing (vs generic throw). Fold into friendly port-conflict ticket (C6) scope or sibling. Low priority, TLS opt-in. Gap G5 from AutoSetup-GapAudit.

**Context:**

Gap G5 of `.tmp/research/AutoSetup-GapAudit-2026-11-15.md:85-90` ("TLS-on-Windows footgun (OpenSSL requirement)"): the OpenSSL requirement is documented (`docs/guide/installation.md:30`, `docs/spec/platform-support.md:86-91`) but nothing makes the boot failure actionable. Verified 2026-11-15 against the shipped code:

- `ensureTlsCerts()` lives in `packages/core/src/config/cert.ts:37-91` (re-exported by `src/config/cert.ts`). It returns `null` when the certs cannot be provisioned and logs two warns: `"Failed to generate certificate. <platform hint>"` and `"TLS certificates unavailable — HTTPS cannot be served."` (`:83-88`). The platform hint is the only OpenSSL guidance anywhere near the failure, and it is a WARN from the `tls` logger child — easily lost in boot output, and it says nothing about the boot outcome.
- `src/server/start.ts:226-235` then fails closed: it logs a fatal and throws `new Error("TLS certificates could not be provisioned — refusing to start without HTTPS")`. That error is what the operator actually reads.
- The top-level handler `src/server/index.ts:12-16` catches it and prints `[server] startup failed: Error: TLS certificates could not be provisioned — refusing to start without HTTPS`, then exits 1. Nothing in that chain names OpenSSL.

The gap was narrow and concrete: the failure was already fail-closed (kept unchanged), but the message the operator saw did not say "OpenSSL is missing" or "install OpenSSL" — and on Windows the OpenSSL install is the non-obvious step (no system OpenSSL by default; the docs point at a Win32 OpenSSL build). The landed fix (`88d335a9a`) classifies the spawn outcome and names OpenSSL with the platform install hint.

Verified runtime facts the implementation MUST respect:

- **The missing-binary case surfaces as a THROW, not a failed result.** `Bun.spawnSync(["openssl", ...])` with a binary that is not on `$PATH` throws `Error: Executable not found in $PATH: "openssl" (errno -2, code "ENOENT")` — it does NOT return `{success: false}` (probed on Bun 1.4.4, Linux x64). `cert.ts:54-81` wraps the spawn in `try { ... } catch { /* try next binary */ }`, so POSIX (single candidate, `openssl`) ends the loop through the catch, and Windows (`openssl.exe`, then `openssl`) tries the next candidate. Any error classification must therefore distinguish "binary not found" from "openssl ran and failed" — today both collapse into the same two warns.
- **TLS is enabled by default in the config shape; the opt-out is `server.tls: false`.** `SERVER_DEFAULTS.tls` carries key+cert paths (`packages/core/src/config/sections/server.ts:16-19`), `createConfigSchema().defaults` materialises them (`packages/core/src/config/schema-class/index.ts:72`), and `loadConfig` starts from those defaults (`packages/core/src/config/load/load.ts:38`) — a probed `loadConfig()` in this worktree returns `server.tls` populated. `normalizeConfig` keeps an explicit `tls: false` (asserted in `packages/core/src/config/load.test.ts:527-538`), and `src/server/start.ts:226` gates on `config.server.tls` truthiness. Consequence: on a machine with no OpenSSL and no pre-existing cert files, the DEFAULT boot fails closed. This ticket is therefore NOT purely "TLS opt-in" in practice — it is the first-boot experience for anyone without OpenSSL, which is exactly the Windows footgun G5 names.
- **Certificate provisioning is not the only TLS failure mode.** `ensureTlsCerts` returns the configured paths verbatim when both files already exist (`cert.ts:39-41`) — no OpenSSL needed in that case. The friendly message must only appear when provisioning actually failed.
- **The setup-state endpoint already reports TLS as a check** (`src/routes/setup/checks.ts:117-124`, id `tls`, hint "TLS certificate files are missing."). It is a read-only existence check and never generates; it is not a substitute for a boot-time error, but it is the same signal on another surface — do not duplicate the wording.

Scope decision (recorded so this is not re-litigated): keep this a SIBLING of C6 (`TASK-friendly-port-conflict-error-on-boot-eaddrinuse.md`, issue `4d06224`); do NOT fold it into C6. C6's own "Do NOT touch" clause requires the generic failure path for non-EADDRINUSE errors to stay untouched — and this failure is a non-EADDRINUSE boot failure thrown from `start()` before any listener binds, so folding it into C6's `src/server/index.ts` catch would violate that clause. The two tickets share only the "friendly boot error" pattern.

Constraints:
- Keep the fail-closed behaviour: still throw, still exit nonzero, never fall back to plaintext HTTP.
- Do NOT add an OpenSSL-less certificate backend (a non-OpenSSL TLS fallback is an explicit anti-candidate — `epic-first-run-auto-setup.md:50`, and the gap audit's "Not recommended" list).
- Do NOT auto-install OpenSSL, and do NOT change the platform-specific install hints already in `cert.ts:83-85` — reuse them rather than writing a third copy.
- One source of truth for the message: classification and wording live with the provisioning code (`packages/core/src/config/cert.ts`); `start.ts` propagates it.
- The message must not leak secrets — it names the binary and the cert paths, nothing else.

Alternatives considered: (a) folding into C6 — rejected, see scope decision; (b) a new non-OpenSSL certificate path (e.g. Bun-native self-signed) — rejected as an explicit anti-candidate and far larger than this ticket; (c) pre-flight OpenSSL detection in the setup-state endpoint only — rejected, the endpoint is a read-only check and the operator hits the failure at boot, not in the setup panel.

**Acceptance Criteria:**

- [x] boot with TLS enabled and OpenSSL absent prints an actionable error naming OpenSSL (and the existing platform install hint) instead of only "certificates could not be provisioned"
- [x] boot still fails closed: nonzero exit, no plaintext listener
- [x] the "openssl binary missing" case is distinguishable from "openssl ran and failed" (different hint text), and the missing-binary case is detected on both POSIX and Windows (`openssl.exe` then `openssl`)
- [x] when both cert files already exist, no OpenSSL-related message appears (provisioning is not attempted)
- [x] unit test covers the message shape (classification by spawn outcome; no real OpenSSL invocation)
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-22 registry-driven close: git issue 6981da3 (registry tip: 45a6e4246 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-TLS-MISSING-OPENSSL-FRIENDL)
