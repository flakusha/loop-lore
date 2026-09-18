<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-003: Evaluate hosting providers (Research)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Research-only evaluation of hosting providers across 8 targets and 4 criteria categories.
**Context:** Decision doc + benchmark results driving the hosting comparison ticket.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status:** open
**Priority:** medium
**Epic:** epic-deployment-infrastructure
**Labels:** infrastructure, cloud-hosting, cost-analysis
**Assignee:** Platform Team

## Summary

Drive a structured hosting-provider evaluation that produces a benchmark-backed recommendation for loop-lore, published at `docs/infrastructure/evaluate-hostings.md` — covering RunPod CPU + serverless, Lambda Labs / Vast.ai / OVH / Hetzner alternatives, and AWS / GCP / DigitalOcean reference points; with latency benchmarks, P3–P5 cost analysis, and a single recommendation.

## Context

- **Scope covered**: CPU instances for serverless requests to llama-swap/llama.cpp pods, network sharing between pods, GPU compute options, and per-tier pricing for P3 (small dev) → P5 (peak burst) instance sizes.
- **Inputs**: `TASK-003-hosting-comparison.md` (qualitative comparison), `TASK-003-gpu-requirements.md` (sizing matrix), and provider pricing pages captured in the dated pricing snapshot.
- **Outputs**: Research report at `docs/infrastructure/evaluate-hostings.md` containing evaluation criteria, target-provider list, benchmark results, P3–P5 cost analysis, and the recommendation.

## Research Focus

- RunPod CPU instances for the loop-lore server with serverless requests to customized llama-swap/llama.cpp pods.
- Network sharing between pods (Redis / PostgreSQL state, prompt cache, model cache).
- Alternative providers with GPU compute options (Lambda Labs, Vast.ai, OVH, Hetzner).
- Reference points (AWS, GCP, DigitalOcean) for benchmarking, not for production recommendation.

## Key Evaluation Criteria

1. **Pricing Model**
   - Hourly rate for CPU instances.
   - Serverless function pricing (per-request, per-second).
   - GPU instance pricing.
   - Storage costs (network volume / persistent disk).
2. **Performance**
   - Token latency benchmarks (Llama-2 / Llama-3 / LFM, real payload sizes).
   - Throughput capacity (req/s at p50 / p99).
   - Network latency between regions and to loop-lore's expected user geography.
3. **Features**
   - Serverless function support (e.g., RunPod Functions).
   - GPU compute capabilities (RTX 4090 / 5090 / A100 / H100).
   - Network sharing capabilities (network volumes, pod-to-pod links, Redis).
   - Persistent storage options (regional replication, snapshotting).
4. **Ease of Use**
   - API / SDK quality (Bun / TypeScript friendly?).
   - Documentation quality and example coverage.
   - Provisioning time (cold-start vs. warm-pool).

## Target Providers

- **RunPod** (primary focus) — CPU + serverless + GPU.
- **Lambda Labs** — GPU steady-state.
- **Vast.ai** — cost-sensitive GPU marketplace.
- **OVH Cloud** — budget EU GPU.
- **Hetzner Online** — affordable VPS, limited GPU.
- **AWS EC2** — reference only.
- **Google Cloud** — reference only.
- **DigitalOcean** — reference only.

## Required Deliverables

- Hosting comparison matrix (Provider × Criterion scoring).
- Latency benchmark results (CSV + summary table).
- Cost analysis for P3 / P4 / P5 instance tiers.
- Recommendation report (single primary, one secondary, one budget).

## Current Findings (preliminary)

- RunPod offers serverless functions with GPU support; native pod-to-pod networking.
- Lambda Labs has strong GPU instances but higher costs than RunPod Flex.
- Vast.ai provides a GPU marketplace with varying quality and reliability.
- Hetzner has affordable VPS but limited GPU options (no A100/H100 tier).
- AWS / GCP may be overkill for steady-state but useful as a benchmark reference.
- DigitalOcean is competitive for CPU tiers but lacks strong GPU options.

## Acceptance Criteria

- Document published at `docs/infrastructure/evaluate-hostings.md`.
- Document covers all eight evaluation-criterion categories (Pricing Model, Performance, Features, Ease of Use, with sub-bullets).
- Benchmark results table reports token latency and throughput for Llama-2 / Llama-3 / LFM at realistic payload sizes.
- P3 (dev), P4 (steady-state), P5 (peak burst) cost table with monthly USD estimates per provider.
- Recommendation block names a single primary, one secondary, one budget provider.
- Cross-linked from `epic-deployment-infrastructure.md`, `TASK-003-hosting-comparison.md`, and `TASK-003-gpu-requirements.md`.

## Related Files

- `docs/infrastructure/evaluate-hostings.md` (to be created) — primary deliverable.
- `docs/infrastructure/hosting-comparison.md` (to be created, see TASK-003-hosting-comparison) — qualitative input.
- `docs/infrastructure/gpu-requirements.md` (to be created, see TASK-003-gpu-requirements) — sizing input.
- `docs/infrastructure/benchmark-results.csv` (to be created) — raw benchmark data.

## Next Steps

1. Benchmark RunPod CPU instances with llama.cpp workload (token-latency + throughput).
2. Test network sharing between pods on RunPod (Redis state, model cache).
3. Compare GPU instance pricing across providers (RunPod / Lambda / Vast.ai / OVH).
4. Evaluate serverless function limitations (cold-start, max payload, max runtime).
5. Author P3 / P4 / P5 cost table and write final recommendation.

## Notes

- Sibling cross-links: `TASK-003-hosting-comparison.md`, `TASK-003-gpu-requirements.md`, `TASK-003-gpu-separation.md`.
- Open question: do we run benchmarks in-house or rely on published provider numbers? In-house is cheaper-to-trust, slower-to-ship.
- Original ticket asked an inline conversational question at the end; removed in the rewrite (no place for it in a ticket record).