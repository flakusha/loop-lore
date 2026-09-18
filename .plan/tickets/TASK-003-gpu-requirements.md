<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-003: GPU instance requirements

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Recommended GPU instance matrix for development (SDXL, Anima, Krea 2, MiniMax H3, Llama/LFM).
**Context:** $/hr pricing across providers with per-workload VRAM floors and 4-layer deployment strategy.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status:** open
**Priority:** medium
**Epic:** epic-deployment-infrastructure
**Labels:** infrastructure, gpu, deployment
**Assignee:** Platform Team

## Summary

Publish GPU sizing recommendations for loop-lore at `docs/infrastructure/gpu-requirements.md`, including a corrected comparison matrix of provider / instance type / GPU / price / workload, a VRAM floor per model family (SDXL, Anima, Krea 2, MiniMax H3, Llama/LFM), and a four-layer deployment strategy (base, high-volume, edge, backup).

## Context

- **Scope covered**: GPU compute sizing for SDXL image gen, Anima animation, Krea 2, MiniMax H3 video, and Llama/LFM LLM inference workloads referenced by `epic-3d-generation.md`, `epic-llm-queue.md`, and `epic-native-module-benchmarks.md`.
- **Inputs**: NVIDIA VRAM specs, current RunPod / Lambda Labs / Vast.ai / OVH pricing pages, and the workload notes from `runpod-comfy` and `runpod-llama` companion repos.
- **Outputs**: Decision doc at `docs/infrastructure/gpu-requirements.md` containing the corrected matrix and per-workload sizing rules.

## Minimum Requirements (baseline dev/workstation)

- **GPU**: NVIDIA RTX 4090 (24 GB VRAM) — fits SDXL + 8B LLM + small Anima renders
- **CPU**: Intel i7-12700K or AMD Ryzen 7 7800X3D
- **RAM**: 64 GB DDR5
- **Storage**: 1 TB NVMe SSD
- **Network**: 1 Gbps+ bandwidth

## Recommended Provider Matrix

| Provider    | Instance Type | GPU              | Price (Approx.) | Workload               |
|-------------|---------------|------------------|-----------------|------------------------|
| RunPod      | Serverless    | RTX 4090 (24 GB) | ~$0.50/hr       | Serverless inference   |
| RunPod      | Flex worker   | RTX 5090 (32 GB) | ~$0.80/hr       | 4K SDXL/Anima          |
| Lambda Labs | A100 40 GB    | A100 (40 GB)     | $1.29/hr        | Steady-state inference |
| Lambda Labs | A100 80 GB    | A100 (80 GB)     | $2.00/hr        | 70B LLM, batch jobs    |
| Vast.ai     | RTX 3090      | RTX 3090 (24 GB) | $0.50–1.00/hr   | Cost-sensitive LLM     |
| OVH Cloud   | RTX 4090      | RTX 4090 (24 GB) | $0.40–0.80/hr   | Budget-friendly GPU    |
| Self-host   | Bare-metal    | PRO 6000 (48 GB) | capex           | 4K+ video, 8K batches  |

## Validation Criteria (per workload)

1. **SDXL Workflow**
   - 4090 handles 1K–2K upscales at ~20 fps.
   - 5090 preferred for 4K workflows and batched upscales.
2. **Anima Integration**
   - 24 GB VRAM minimum for animation rendering.
   - PRO 6000 (48 GB) handles 4K+ animation streams.
3. **Krea 2 Optimization**
   - 4090 reaches ~120 fps with SDXL on single-stream generation.
   - 5090 required for batch processing >4 concurrent streams.
4. **MiniMax H3 (video)**
   - 4090 meets real-time 1080p generation.
   - PRO 6000 handles 8K video AI generation.
5. **Llama / LFM Inference**
   - 8B models fit on 4090 (24 GB) at 4–8K context.
   - 70B models need A100 80 GB or PRO 6000 (48 GB) with quantization.

## Cost Analysis (24/7 inference, reference workload)

- **Always-on 4090**:
  - RunPod Flex: ~$360/month (RTX 4090)
  - Lambda Labs: ~$920/month (A100 40 GB)
  - OVH Cloud: ~$290/month (RTX 4090, regional)
- **Peak Load Handling**:
  - PRO 6000 recommended for >10 concurrent users.
  - 5090 + 2× 4090 cluster pattern for extreme scaling.

## Deployment Strategy

1. **Base Layer**: RunPod RTX 4090 serverless inference for chat-time LLM calls.
2. **High-Volume Layer**: Lambda Labs A100 for batch jobs and 70B-class inference.
3. **Edge Layer**: OVH RTX 4090 for regional caching of static prompts / models.
4. **Backup**: Vast.ai RTX 3090 for cost-sensitive burst jobs.

## Maintenance Plan

- Weekly GPU memory monitoring (VRAM headroom ≥ 20%).
- Monthly driver + CUDA toolkit updates.
- Quarterly hardware refresh cycle review.
- Annual stress testing against SDXL / Anima reference workloads.

## Risk Mitigation

- GPU failure redundancy via provider failover (RunPod → Lambda).
- Storage redundancy for animation files (network volume + cold S3 tier).
- Network failover for real-time generation (multi-region replication).
- Auto-scaling policies for traffic spikes (serverless + warm-pool hybrid).

## Acceptance Criteria

- Document published at `docs/infrastructure/gpu-requirements.md`.
- Document includes the corrected Provider / Instance Type / GPU / Price / Workload matrix.
- Per-workload VRAM floors documented for SDXL, Anima, Krea 2, MiniMax H3, and Llama/LFM.
- Cross-linked from `epic-deployment-infrastructure.md` and `TASK-002-bare-metal-deployment-guide.md`.
- Pricing rows cite a date-stamped source (RunPod / Lambda Labs / Vast.ai / OVH pricing pages).

## Related Files

- `docs/infrastructure/gpu-requirements.md` (to be created) — primary deliverable.
- `docs/infrastructure/gpu-pricing-snapshot.md` (to be created) — dated pricing snapshot for the matrix.
- `docs/ops/bare-metal-deploy.md` (to be created, see TASK-002) — reuses the sizing floors.

## References

- [NVIDIA RTX 4090 Specs](https://www.nvidia.com/en-us/geforce/graphics-cards/rtx-4090/)
- [Lambda Labs GPU Benchmarks](https://lambda.labs/benchmarks)
- [Vast.ai Provider Ratings](https://vast.ai/benchmark)
- [RunPod Pricing](https://www.runpod.io/pricing)

## Notes

- Sibling cross-links: `TASK-003-hosting-comparison.md`, `TASK-003-evaluate-hostings.md`, `TASK-003-gpu-separation.md`.
- Open question: capture a single canonical pricing snapshot, or refresh on every edit?