# TASK: SD e2e real-server fixtures via sd.cpp and ComfyUI with generation metadata

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Task
**Tags:** e2e, sd.cpp, comfyui, stable-diffusion, fixtures, metadata, opt-in
**Epic:** epic-e2e-integration-testing.md (Pillar 3 — real-server tier)
**Related:** TASK-real-llm-sd-e2e-fixture-llama-cpp-llama-swap-sd-server.md, FEAT-comfyui-plugin-workflow-templates.md, TASK-generation-mock-scenario-provider.md, TASK-generation-cassette-replay.md, epic-comfyui-plugin.md

## Summary

Extend the opt-in real-server e2e tier (sibling of TASK-real-llm-sd-e2e-fixture-llama-cpp-llama-swap-sd-server) to stable-diffusion: (1) sd.cpp (llama.cpp family CLI/server) as a fixture generator — small checkpoint, tiny resolution/steps, deterministic seeds; (2) ComfyUI as a second backend using the plugin workflow templates (FEAT-comfyui-plugin-workflow-templates) to drive generation via its API; (3) generated outputs become committed/regenerable image fixtures for downstream tests (avatar, emotion, VN scene, asset pipeline); (4) standard templates embed generation metadata in the generated content (PNG tEXt chunks / ComfyUI workflow metadata: model, seed, steps, sampler, prompt hash) so fixtures are self-describing and provenance-verifiable in tests. Opt-in env-gated like LL_REAL_E2E; never in bun run check; graceful skip when binaries/models missing.

The LLM sibling proves text routing against llama.cpp/llama-swap; this ticket does the same for the image path with two backends:

1. **sd.cpp** (stable-diffusion.cpp, llama.cpp family) — CLI/server backend for tiny deterministic generations: small checkpoint (SD 1.x/2.x), minimal resolution (64×64), few steps, fixed seed.
2. **ComfyUI** — second backend driven through its HTTP API using the plugin workflow templates (`FEAT-comfyui-plugin-workflow-templates`, `epic-comfyui-plugin`), proving template registry + workflow submission + polling against a real instance.

Generated outputs become committed/regenerable **image fixtures** for downstream tests (avatar, emotion avatar, VN scene, asset pipeline preview/metadata extraction).

**Metadata contract:** standard generation templates embed generation metadata in the generated content itself — PNG `tEXt` chunks (sd.cpp parameter embedding) or ComfyUI's native workflow metadata: model, seed, steps, sampler, prompt/prompt-hash. Fixtures are self-describing; tests assert provenance by reading metadata back instead of trusting filenames.

## Acceptance Criteria

### Infrastructure

+- [ ] Opt-in gating consistent with the LLM sibling: shared `LL_REAL_E2E=1` plus existing `TESTING_SD_MODEL` config; graceful skip when binary/model missing (`tests/e2e/helpers/server-external.ts` pattern). Never invoked by default CI or `bun run check`.
+- [ ] ComfyUI endpoint surfaced via `src/config/schema/testing.ts` (reuse existing env-map mechanism; add a field only if none fits).
+- [ ] Fixture outputs land in `.tmp/` during runs; committed fixtures (if any) are tiny, deterministic-seed PNGs regenerated via documented commands.

### Coverage

+- [ ] Scenario: sd.cpp generation round-trip — fixed seed, assert output decodes as PNG and embedded metadata contains model/seed/steps/sampler.
+- [ ] Scenario: ComfyUI workflow-template generation — submit a standard template via the plugin's template registry to a real ComfyUI API, poll to completion, download result, assert same metadata contract (ComfyUI prompt/workflow metadata in PNG chunks).
+- [ ] Metadata round-trip test: read back embedded metadata from generated fixtures and compare against request parameters (provenance check usable by asset-metadata extraction tests).

### Quality gates (preserved)

+- [ ] Files use describe-level skip so `bun run check` pays only import cost under default env.
+- [ ] No production code changes beyond config schema additions unless a real defect surfaces.

## Verification

```bash
# Default: skip cleanly
bun test tests/e2e/flows/real-image-generation.test.ts   # → skipped, exit 0

# Opt-in
export LL_REAL_E2E=1
export TESTING_SD_MODEL=/path/to/sd-checkpoint.safetensors
export TESTING_COMFYUI_URL=http://127.0.0.1:8188   # if wired
bun test tests/e2e/flows/real-image-generation.test.ts
