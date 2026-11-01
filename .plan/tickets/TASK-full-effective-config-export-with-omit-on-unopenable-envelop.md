<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: full effective-config export with omit-on-unopenable-envelope redaction

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## What

Extend the admin export beyond the system_config DB plane to the FULL effective yaml-plane config (file layers + env merge result), with a redaction pass that classifies nested secrets (provider apiKey, nsfw.piiSecret, env.yaml secrets) and OMITS — never falls back — unopenable secret envelopes.

The two config planes must not be conflated: GET /api/admin/system-config/export (issue e92f904, Done) exports persisted system_config DB rows only, with regex-on-flat-key ***REDACTED*** redaction (src/admin/config-keys.ts:12, redaction at system-config.ts:72); nothing today dumps the merged in-memory Config (verified: no effective/full config route exists). Reverse path stays the import surface: importConfigFromText (src/admin/config.ts:227-254) plus the planned import endpoint (issue a8cda49, Not Started).

Redaction requirements: (a) nested file-plane keys need their own classification beyond the flat-key regex; (b) envelope-open failure currently falls back to returning the stored reference/value with only a warn (src/admin/config-secrets.ts:72-75) — the dump MUST omit the key and note the omission instead; (c) any system_config key not matching the pattern exports plaintext by design (unchanged behavior).

## Why

Research round 3 candidate C4 (effort S-M, no deps): operators cannot back up or migrate the effective file-plane config; provider apiKey and PII secrets live in the file plane and are covered by neither export nor redaction today.

## Scope

- admin route: GET /api/admin/effective-config/export (or a scope param on the existing export route), reusing export-route plumbing (src/routes/admin/system-config.ts:64-111)
- nested secret classification util + omit-on-unopenable-envelope behavior
- tests: round-trip import, grep-proof redaction, envelope-failure omission

## Do NOT touch

- Do NOT dump raw env vars (process environment is out of scope)
- Do NOT change the existing system_config export semantics (e92f904 stays as is)
- Do NOT fall back to plaintext on envelope-open failure — omit and note

## Acceptance Criteria

- [ ] exported YAML re-imports via importConfigFromText into a fresh DB with identical effective values (round-trip)
- [ ] grep-proof: no value matching SECRET_KEY_PATTERN semantics appears plaintext in the dump
- [ ] envelope-open failure omits the key and notes the omission (no fallback-to-value path)
- [ ] nested secrets (providers[].apiKey, nsfw.piiSecret) are classified and redacted or omitted
- [ ] import path (YAML/TOML upload, a8cda49) remains standalone-functional against this export

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
