<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: friendly port-conflict error on boot (EADDRINUSE)

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## What

Catch EADDRINUSE specifically in the boot failure handler at src/server/index.ts:12-16 (currently ANY boot failure prints [server] startup failed: `<err>` to stderr and process.exit(1)) and print an actionable message: the host:port that could not bind plus the port override hint (config server.port / env equivalent). Every other failure keeps the existing generic path. Still exits nonzero.

## Why

Research round 3 candidate C6: port conflict is the most common first-run crash after the PII gate, and the bare Bun.serve throw gives the operator nothing actionable (approaches doc section 2 OS parity notes; exit path verified at src/server/index.ts:13-16).

## Scope

- src/server/index.ts boot catch: EADDRINUSE detection plus friendly message with host:port and override hint
- unit test for the message shape (classify by error code; no real port binding needed)

## Do NOT touch

- Do NOT change the exit code (still nonzero)
- Do NOT retry binding or auto-pick another port
- Do NOT alter the generic failure path for non-EADDRINUSE errors (including the PII gate message, which is already good)

## Acceptance Criteria

- [ ] occupied-port boot prints an actionable message naming host:port and the port override hint
- [ ] boot still exits nonzero on port conflict
- [ ] non-EADDRINUSE boot failures keep the existing generic startup-failed output

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
