<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP profile harness adapters

**Status:** Done
**Status Note:** Landed on branch feat-acp-harness-adapters (worktree slice, pending finalize): opencode + codex adapters on the shared `GenericAcpAdapter` engine (`src/integrations/harness/generic-acp.ts`), omp.ts migrated onto the engine (public API unchanged), fake fixture extended with `FAKE_CONFIG_ID`/`FAKE_NO_SESSION` flavors, suites for both new adapters mirroring the omp suite. Deviation per AC 3: claude-code split out to TASK-acp-claude-code-adapter — its adapter (`@agentclientprotocol/claude-agent-acp`) exposes model selection only through a non-standard `models` session/new field plus the `unstable_setSessionModel` extension method (no stable v1 config-option select), so implementing it would require guessing wire casing, which the caveat forbids. Second deviation: codex advertises bare model-preset ids (no provider prefix), so its adapter namespaces them as `codex/<preset>` to preserve the core's `provider/id` contract — no core changes needed.

Follow-up slice (same branch): profile flavor selection — `AcpProfileConfig.harness`
(`"omp" | "opencode" | "codex"`, optional, default `"omp"`), runtime list
`HARNESS_FLAVORS` (schema/harness.ts), validation rejects unknown flavors, JSON-schema
meta exposes the enum, and `src/integrations/harness/flavor-factories.ts` maps flavor →
adapter factory (`resolveAdapterFactory(profile.harness)`). Reviewer F1 note: dev has NO
composition root yet — `ProfileRegistry` is only constructed in tests, so the factory is
still injected by the caller; the wiring slice that builds a production registry must
consume `resolveAdapterFactory` (this module is deliberately the one flavor-aware
extension point). Also fixed on review: spawn failures now classify as error kind
`spawn` (was mislabeled `initialize` — the jsonrpc transport message lacks the word
"spawn"), and the unreachable `"closed"` HarnessAcpErrorKind was dropped (no consumer
matched it).
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

- [x] opencode adapter passes the same fake-fixture test suite as the omp
      adapter, using a canned opencode-flavored fixture
      (`opencode-adapter.test.ts` on `FAKE_CONFIG_ID: "model"`)

- [x] opencode profile/config enumeration maps onto `harness.acp.profiles[]`
      semantics (argv spawn, tier model ids, advertised-model probe) —
      `opencode acp` advertises a `model` select with `providerID/modelID`
      values, consumed verbatim by the registry probe

- [x] codex adapter implemented over its generic ACP surface
      (`session/set_config_option`, configId `model`; bare preset ids
      namespaced `codex/<preset>`); claude-code explicitly split out to
      TASK-acp-claude-code-adapter (see Status Note)

- [x] No omp-specific imports or assumptions outside `omp.ts` — the shared
      engine (`generic-acp.ts`) contains no omp references; omp's
      `MODEL_CONFIG_ID`/`_omp/usage` mapping stayed inside omp.ts

- [x] `bun test src/integrations/harness/` green with the new suites
      (serial-isolated run, all files)

**Caveats:**

- TOCTOU: each harness's advertised-model list is probed once per registry
  instance (same limitation as the omp slice).

- Partial failure: adapter spawn/initialize failures must surface as
  HarnessAcpError, never crash the caller.

- Rollback: adapters are additive; the core remains functional with only the
  omp adapter registered.

- Dependency: if codex/claude-code lack stable ACP method names, split those
  two into a follow-up rather than guessing wire casing.
