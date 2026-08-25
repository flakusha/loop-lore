<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Real LLM/Sd e2e fixture (llama.cpp + llama-swap + sd-server)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Task
**Tags:** e2e, llama.cpp, llama-swap, sd-server, fixture, opt-in, real-server
**Epic:** epic-e2e-integration-testing.md
**Related:** TASK-generation-mock-scenario-provider.md, TASK-generation-cassette-replay.md, FEAT-byok-local-models.md, TASK-ollama-native-provider.md, epic-cross-platform-portability.md

## Summary

Formalize the existing opt-in `tests/e2e/flows/real-generation.test.ts` + `tests/e2e/helpers/server-external.ts` into a single, tier-gated fixture (llama.cpp + llama-swap + sd-server) that runs *only* on runners with real binaries/models, and add **one** new scenario that proves multi-provider routing (aux + story/general LLM coexisting behind llama-swap). Default CI never invokes it; `bun run check` never invokes it.

## Context

The "buildup" already exists:

- `src/services/server-external-manager/{index,lifecycle,probes,start-llama,start-sd,types}.ts` — production lifecycle for llama.cpp + sd-server auto-start.
- `tests/e2e/helpers/server-external.ts` — test-side mirror with `startLlamaCpp`, `startLlamaSwap`, `startSdCpp`; graceful skip when binary or model missing.
- `tests/e2e/flows/real-generation.test.ts` — currently exercises `real-llama` (OpenAI-compatible over llama.cpp HTTP) + `sd-server` directly. Gated by `LL_REAL_E2E_SKIP=1` and per-binary `findBinary` skip.
- `src/test-utils/mock-provider.ts` (`MockLLMProvider`) — text + streaming only; **no** tools/thinking/embeddings/error taxonomy.
- `src/services/external-server-utils.ts:14-17` — `BINARY_CANDIDATES["llama-swap"] = ["llama-swap"]` already wired; `findBinary("llama-swap")` resolves cross-platform (Windows `.exe` suffix handled at lines 19-26).
- `src/services/server-external-manager/start-llama.ts:189-198` — production `resolveLlamaSwapPort` helper reads `startPort` from YAML (production code does this **correctly**).
- `epic-e2e-integration-testing.md` Pillar 3 already tracks `TASK-generation-mock-scenario-provider` (full-surface mock + fake ComfyUI) and `TASK-generation-cassette-replay` (VCR-style fidelity). This ticket is the **third leg** of Pillar 3: real-server fidelity for the cases the mock + cassette cannot cover.

### Buildup review — what the user weighed

| Concern | Real llama.cpp / llama-swap | MockScenarioProvider (planned) |
|---|---|---|
| Resource cost to start | High — model load (2–60 s), RAM pinned (4–48 GB), GPU contention in CI | Zero — in-process JS |
| Per-test runtime | Slow — token streaming adds seconds per assertion | µs |
| Timeout growth | Material — must extend per-test budget; CI parallelism hit | None |
| Determinism | Stochastic (temperature=0 helps but still varies) | Exact |
| Streaming wire-shape fidelity | **Real** — actual SSE chunk boundaries, tool-call deltas, error taxonomy | Imitation — cassettes add fidelity but start as faithful approximation |
| Flow coverage (aux + story/general LLM all present) | **Real** — proves registry + failover + multi-provider routing with a real OpenAI-compatible endpoint behind llama-swap | Partial — proves routing + failover logic only |
| CI feasibility on commodity runners | Poor without GPU runner pool | Excellent |
| Local dev loop | Painful (start cost per `bun test`) | Fast |

**Verdict**: keep this tier **opt-in, default-off, smallest viable models**. Do **not** wire into `bun run check`. Do **not** duplicate `MockScenarioProvider`'s deterministic surface. The three legs are complementary: mock for fast + exact; cassette for wire-shape; real for multi-provider coexistence + actual server taxonomy.

## Acceptance Criteria

### Infrastructure

- [ ] Move existing `tests/e2e/helpers/server-external.ts` opt-in gating behind a single env var: `LL_REAL_E2E=1` (replaces `LL_REAL_E2E_SKIP=1` inversion). Default off.
- [ ] Models + ports sourced from existing `src/config/schema/testing.ts` (`testing.llamaModel`, `testing.sdModel`, `testing.llamaPort`, `testing.sdPort`) via env vars already mapped in `src/config/schema-class/env-map.ts:151-152` (`TESTING_LLAMA_MODEL`, `TESTING_SD_MODEL`). **Do not introduce new env vars for these**; extend the existing schema if llama-swap needs its own config field.
- [ ] Add `src/config/schema/testing.ts` field `llamaSwapConfig?: string` (path to llama-swap config) gated behind the same `LL_REAL_E2E=1` check; mapped via `env-map.ts` as `TESTING_LLAMA_SWAP_CONFIG`. This is the only new config surface.
- [ ] **Use the committed `configs/` configs as the fixture input** — both `configs/config.llama-swap.yaml` (already present, declares `startPort: 7180` and three model groups including `llama/faded-red-star/lfm2.5-vl-6b`) and any future `configs/config.llama-cpp.yaml`. The fixture doubles as a **pre-flight check** that those committed configs are functionally valid (not just well-formed YAML), which catches regressions in the configs themselves before they reach a developer or operator.
  - Default `TESTING_LLAMA_SWAP_CONFIG` should point at `configs/config.llama-swap.yaml` (resolved via existing `src/services/server-external-manager/start-llama.ts:189-198` `resolveLlamaSwapPort` helper which reads `startPort` from the YAML — production already does this correctly).
  - **Known bug to fix in scope**: `tests/e2e/helpers/server-external.ts:175-186` hardcodes port `8080` for the readiness probe and returned `instance.port`, ignoring the actual `startPort` from the YAML. This is the **inverse** of the production code at `src/services/server-external-manager/start-llama.ts:152,155,165,178,191-198` (which derives `port` correctly via `resolveLlamaSwapPort`). **Fix**: extract `resolveLlamaSwapPort` into `src/services/external-server-utils.ts` (next to `findBinary`) and have `tests/e2e/helpers/server-external.ts:175-186` consume it. After the fix, drop the `tests/e2e/fixtures/llama-swap-config.yaml` requirement and have the fixture point at `configs/config.llama-swap.yaml` directly — **do not** mutate `configs/config.llama-swap.yaml` to make the test happy.
  - Test registers two providers with distinct `model` aliases against the same model group in `configs/config.llama-swap.yaml` — proves registry resolution, not model variance. Use the `llama/faded-red-star/lfm2.5-vl-6b` group as the model (the user's preferred lfm pick; small + fast + materially more capable than qwen2.5-0.5b).
- [ ] Document smallest viable model picks in `tests/e2e/fixtures/README.md` (new file):
  - LLM: **`lfm` family** (`llama/faded-red-star/lfm2.5-vl-6b` group in `configs/config.llama-swap.yaml`) — preferred over `qwen2.5-0.5b-instruct-q4_k_m` because lfm is materially more capable while remaining small + fast on CPU. Picked as a *capable enough* model so the multi-provider aux + story scenarios return useful output, not noise.
  - SD: any 1.5/2.x SD checkpoint at 64×64, 5 steps.
  - If the test helper bug (above) is **not** fixed before the fixture runs, the README must also document that the fixture uses `tests/e2e/fixtures/llama-swap-config.yaml` (a test-specific copy with `startPort: 8080`) instead of the production config — and the rationale.
- [ ] Add CI workflow `.github/workflows/real-llm-e2e.yml` (new file, sibling to existing `pr-checks.yml`/`ci.yml`/`release.yml`) — separate job, `runs-on: linux-large` (or self-hosted GPU if available), only on `dev` + manual `workflow_dispatch`. Never on PR default.

### Coverage additions

- [ ] **Scenario: llama-swap multi-provider routing** (new file `tests/e2e/flows/real-multi-provider.test.ts`):
  - Start llama-swap with the **committed** `configs/config.llama-swap.yaml` (or the test-specific copy if the test-helper bug above is not yet fixed). Read the actual listening port from `llamaInstance.port` (post-fix) or hardcode `8080` (pre-fix) — do not template a different number.
  - Target the **`llama/faded-red-star/lfm2.5-vl-6b`** group: register two providers against `http://127.0.0.1:<port>/v1`, both with `model: "llama/faded-red-star/lfm2.5-vl-6b"` (group name MUST equal the `model` field; llama-swap routes by `model` in the request body — an unknown model returns 4xx):
    - `story-llm` → ctx 512, max_output 256
    - `aux-llm`  → ctx 256, max_output 64 — distinct registry entry, distinct alias, same underlying model
  - Hit `POST /api/generation/generate` with `provider: "story-llm"` (story path) and a separate aux call (e.g. classification via `src/aux-pipeline/...`) — assert both round-trip and resolve through the OpenAI-compatible registry without collision.
  - **Pre-flight assertion**: the test also asserts the YAML parsed cleanly into llama-swap (i.e. the proc is alive after warm-up) — this is the "pre-flight" half: catches YAML regressions in `configs/config.llama-swap.yaml` early.
  - **Skip pattern**: follow `real-generation.test.ts:120-122` (`if (!llamaInstance) return;`) at the top of every test — graceful no-op when the fixture returned `null`.
  - This is the **only** way today to prove aux + story/general LLM coexist against a real OpenAI-compatible surface; the existing `real-generation.test.ts` only registers one provider.
- [ ] **Scenario: real streaming wire-shape snapshot** (add to `real-generation.test.ts`): assert SSE chunk deltas arrive (`content` events ≥ 2), `finishReason: "stop"` present, `usage` present — non-bypassable contract for the streaming code path. Skipped if streaming not supported by model.

### Quality gates (preserved)

- [ ] `bun run check` stays green. The default gate runs `bun run test:e2e` which traverses `tests/e2e/` — new files are **not** file-pattern-excluded. They MUST use `describe.skip` (or equivalent) when `LL_REAL_E2E != 1` so the gate only pays the import + describe-eval cost (≈ 100 ms per file), not the spawn/wait cost.
- [ ] `bun test tests/e2e/flows/real-generation.test.ts` and `real-multi-provider.test.ts` skip cleanly when `LL_REAL_E2E != 1` or binaries/models missing — never fail (per the `if (!llamaInstance) return;` pattern).
- [ ] No real-server fixture enters `src/` test path beyond `tests/e2e/`; production code (`src/services/server-external-manager/`) is not modified unless a real defect surfaces.

## Notes

### Why llama-swap, not two llama.cpp processes

The user's framing highlights **flows that require aux + story/general LLM to be present**. Mock providers can prove registry + failover logic; they cannot prove two providers coexist against a *real* OpenAI-compatible endpoint (different aliases, same wire, distinct registry entries). `llama-swap` is the cheapest way to get this — one binary, one process, one GGUF, two routed model aliases.

### Known hazards (not in scope, document for future)

- **Process leak on abort**: `manager.stopAll()` runs in `afterAll` only. SIGINT/SIGKILL/OOM in CI leaves orphaned `llama-server` / `llama-swap` / `sd-server` children — same hazard exists in the current `real-generation.test.ts`. Out of scope for this ticket; future cleanup ticket should add a `process.on("exit")` hook that signals the manager.

### Why not wire into `bun run check`

- Model load (2–60 s) + RAM (4–48 GB) makes it unfit for any default runner.
- Stochastic outputs defeat contract assertions.
- The mock + cassette path is the right place for deterministic surface coverage.

### Why use the committed `configs/` configs (pre-flight)

The committed `configs/config.llama-swap.yaml` already declares real model groups (`llama/faded-red-star/lfm2.5-vl-6b`, `llama/naphula/goetia-26b`, `llama/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF`) and macros (`llama-server-default`, `llama-server-mtp`). Pointing the fixture at the **same** file the operator will use makes the e2e suite a **pre-flight check** for those configs:

- **YAML regressions caught early** — a malformed `configs/config.llama-swap.yaml` (bad indent, missing `startPort`, typo in `cmd:`) now fails in CI rather than at a developer's `bun run dev`.
- **Operator parity** — what CI tests is what ships. No "works in CI, breaks for the user" drift between test fixture and committed config.
- **Cheap coverage** — a single 30 s warm-up proves three things at once: (1) the YAML parses, (2) llama-swap + llama-server binaries resolve on PATH, (3) the OpenAI-compatible endpoint actually serves completions against the chosen GGUF.

The trade-off: the test fixture is no longer hermetic (it depends on `configs/config.llama-swap.yaml` content). Accept this dependency; it's the same one operators accept. Do **not** fork the config into `tests/e2e/fixtures/llama-swap-config.yaml` unless the test-helper bug above is not yet fixed.

### Cross-references to reconcile

- `epic-e2e-integration-testing.md` Pillar 3 — this ticket sits as a sibling to `TASK-generation-mock-scenario-provider` and `TASK-generation-cassette-replay`.
- `epic-cross-platform-portability.md` — Windows/macOS compatibility notes for spawning llama.cpp/llama-swap (already covered by `external-server-utils.ts:19-26` + `lifecycle.ts:9-19`); no new cross-platform work needed for this ticket.

## Verification

```bash
# Default: skip
bun test tests/e2e/flows/real-generation.test.ts
# → all tests skipped, exit 0
bun test tests/e2e/flows/real-multi-provider.test.ts
# → all tests skipped, exit 0

# Opt-in: real binary on PATH, models set via existing config
export LL_REAL_E2E=1
export TESTING_LLAMA_MODEL=/path/to/lfm.gguf
export TESTING_SD_MODEL=/path/to/sd-checkpoint.safetensors
export TESTING_LLAMA_SWAP_CONFIG=configs/config.llama-swap.yaml
bun test tests/e2e/flows/real-generation.test.ts tests/e2e/flows/real-multi-provider.test.ts
# → both files run; llama.cpp warm-up ≤ 15 s; llama-swap warm-up ≤ 30 s; full suite ≤ 90 s

# Gate unchanged (real-server files run via test:e2e, but skip at describe level under default env)
bun run check   # → green; describe.skip short-circuits real-server files under default env
```
