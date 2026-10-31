<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP profile harness adapters

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-external-harness-acp

**Summary:**

**Summary:**

Per-harness profile adapters building on the harness-agnostic ACP core
(`HarnessAcpAdapter` contract in `src/integrations/harness/adapter-types.ts`):
opencode first (its config/profile surface + model enumeration), then codex
and claude-code via their generic ACP surfaces. Each adapter maps its
harness's profile/model/limit surface onto the same ProfileRegistry /
ProfileSelector / UsageLedger / breaker contracts — zero changes to core
expected; a new adapter is a factory + wire mapping only.

**Context:**

The profile-aware selection slice (TASK-acp-profile-aware-model-selection)
landed the core and the omp reference adapter. Other harnesses (opencode,
codex, claude-code) also expose multiple profiles/models over ACP-style
stdio JSON-RPC, but each advertises its model list and quota surface
differently. The adapter seam exists precisely so those differences stay
inside per-harness files.

**Acceptance Criteria:**

- [ ] opencode adapter passes the same fake-fixture test suite as the omp
      adapter, using a canned opencode-flavored fixture

- [ ] opencode profile/config enumeration maps onto `harness.acp.profiles[]`
      semantics (argv spawn, tier model ids, advertised-model probe)

- [ ] codex / claude-code adapters implemented over their generic ACP
      surfaces (or explicitly split out if their surfaces diverge)

- [ ] No omp-specific imports or assumptions outside `omp.ts`
- [ ] `bun test src/integrations/harness/` green with the new suites

**Caveats:**

- TOCTOU: each harness's advertised-model list is probed once per registry
  instance (same limitation as the omp slice).

- Partial failure: adapter spawn/initialize failures must surface as
  HarnessAcpError, never crash the caller.

- Rollback: adapters are additive; the core remains functional with only the
  omp adapter registered.

- Dependency: if codex/claude-code lack stable ACP method names, split those
  two into a follow-up rather than guessing wire casing.
