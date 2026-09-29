<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Secrets-in-Patch Pre-Commit Scanner

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** Low
**Type:** Feature Task / Security
**Tags:** agent, sandbox, secrets, pre-commit, security
**Epic:** epic-recursive-self-improvement

Pre-commit hook scanning agent patches for secrets (`.credentials.env`, `*.pem`, AWS keys, GitHub PATs); rejects commit on hit — Part D constraint made executable.

## Core Features

- `src/agent/api/secret-scan.ts` — scans unified diff against patterns: AWS `AKIA…`, `ghp_/gho_/github_pat_`, PEM blocks, `.credentials.env` paths, high-entropy long tokens; returns file + line hits.
- Blocking gate in agent commit path (#8) before `giwt commit-wt`; also runnable as standalone `bun run` script.
- Allowlist for test fixtures (explicit paths only).

## Acceptance Criteria

- [ ] Patch with AWS key, GitHub PAT, or PEM block rejected with file + line cited
- [ ] Clean patches pass with <100ms added latency on 100KB diff
- [ ] No false positive on repo test fixtures (allowlist covers them)
- [ ] Unit tests per pattern + adversarial cases (split-lines, base64-wrapped)

## Files

- `src/agent/api/secret-scan.ts` — new
- `src/agent/api/secret-scan.test.ts` — new
- `src/agent/api/commit.ts` — gate commit on scan (extends #8)

## Notes / Verification

- Depends on #8 (commit path to gate).
- Stdlib regex only; no new dep. Skipped entropy ML, add when regex measurably misses.


git issue: b17107c
