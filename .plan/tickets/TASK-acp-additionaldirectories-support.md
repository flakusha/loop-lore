<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP additionalDirectories support

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Accept `additionalDirectories` on a harness profile and pass absolute roots through ACP `session/new`.

**Context:** ACP additional-directories RFD is supported by opencode and codex-acp; loop-lore has no such field. Gap G22 in `.tmp/research/harness-parity/21-parity-gap-ranked.md:616-634`.

**Acceptance Criteria:**

- [ ] Profile config accepts `additionalDirectories?: string[]`; `session/new` sends the configured roots.
- [ ] Relative paths are rejected locally before the request goes out.
- [ ] Fake fixture echoes params; per-test mkdtemp roots removed in `finally`.
