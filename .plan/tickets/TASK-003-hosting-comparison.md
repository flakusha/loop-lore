<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-003: Hosting Provider Comparison for Loop-Lore Deployment

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Detailed comparison of RunPod, Lambda, Vast.ai, OVH, AWS Lambda for hosting.
**Context:** Per-provider pricing models in $/hr; recommendation matrix.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status:** open
**Priority:** medium
**Epic:** epic-deployment-infrastructure
**Labels:** infrastructure, cloud-hosting, cost-analysis
**Assignee:** Platform Team

## Summary

Publish a hosting-provider comparison report at `docs/infrastructure/hosting-comparison.md` covering RunPod, Lambda Labs, Vast.ai, OVH Cloud, and AWS Lambda — with a unified Provider / Best For / Key Advantages / Key Limitations matrix, per-provider pricing models, and a primary/secondary/alternative recommendation block for loop-lore's CPU + GPU + network-sharing workloads.

## Context

- **Scope covered**: CPU instances for serverless llama-swap/llama.cpp pods, GPU compute options, network sharing across pods, and steady-state vs. burst cost analysis.
- **Inputs**: Pricing pages for RunPod / Lambda Labs / Vast.ai / OVH Cloud, AWS Lambda pricing reference, and the sizing inputs from `TASK-003-gpu-requirements` / `TASK-003-gpu-separation`.
- **Outputs**: Decision report at `docs/infrastructure/hosting-comparison.md` containing the matrix, per-provider analysis, and the recommendation block.

**Date**: 2026-08-14
**Project**: loop-lore (RPG chat application)
**Focus**: CPU instances for serverless requests to llama-swap/llama.cpp pods, GPU compute options, network sharing.

## Executive Summary

| Provider      | Best For                                                       | Key Advantages                                                                                                                                                                       | Key Limitations                                                              |
|---------------|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| **RunPod**    | Serverless inference, flexible GPU options, managed serverless  | • Pay-per-second compute (no upfront cost) • Built-in serverless functions • Easy GPU scaling (RTX, A100, H100) • Simple network sharing between pods • Good for variable workloads | • Less mature than AWS/GCP • Limited free tier • Pricing varies by region    |
| **Lambda Labs** | High-performance GPU inference, consistent performance       | • Competitive GPU pricing (~$1.29/hr baseline) • Strong performance for LLM workloads • Enterprise-grade infrastructure • Good for steady-state inference                      | • Higher hourly rates than RunPod for GPU seats • Less flexible serverless options |
| **Vast.ai**   | Cost-sensitive GPU compute, marketplace variety                | • Competitive GPU pricing (often lower than Lambda) • Large model marketplace • Flexible compute options                                                                            | • Variable quality across providers • Less predictable pricing               |
| **OVH Cloud** | Budget-conscious, regional presence                            | • Cheapest GPU options in some regions • Broad data center network                                                                                                                  | • Limited regions • Fewer GPU instance types                                  |
| **AWS Lambda**| Existing AWS ecosystem, hybrid deployments                     | • Mature, reliable • Can integrate with existing AWS infra                                                                                                                            | • Cold starts for GPU workloads • Complex pricing model                      |

## Detailed Analysis

### RunPod

- **Pricing Model**: Pay-per-second serverless compute (no upfront costs)
- **GPU Options**: RTX series, A100, H100, RTX 4090
- **Serverless Functions**: Yes — can run llama.cpp pods as serverless functions.
- **Network Sharing**: Supported via network volumes and pod-to-pod connections.
- **Best For**: Variable inference workloads, serverless-first architecture.
- **Cost Estimate** (approx. for 24/7 inference):
  - RTX 4090: ~$0.50–1.00/hr
  - A100: ~$1.50–3.00/hr
- **Pros**: Simplest serverless experience, good GPU variety, easy networking.
- **Cons**: Less mature than AWS/GCP, limited free tier.

### Lambda Labs

- **Pricing Model**: GPU hourly rates + storage + network.
- **GPU Options**: A100, H100, RTX variants.
- **Serverless**: Not primarily serverless; more focused on GPU clusters.
- **Network Sharing**: Via cluster networking.
- **Best For**: Steady-state GPU inference, training + inference.
- **Cost Estimate** (approx.):
  - A100: ~$1.29/hr (based on benchmark).
  - H100: ~$2.50+/hr.
- **Pros**: Excellent GPU performance, strong community.
- **Cons**: Higher hourly rates, less serverless-oriented.

### Vast.ai

- **Pricing Model**: Per-hour GPU rentals + spot instances.
- **GPU Options**: Wide range from consumer to enterprise GPUs.
- **Network Sharing**: Via shared volumes.
- **Best For**: Cost optimization, flexible GPU selection.
- **Cost Estimate** (approx.):
  - Consumer GPUs: $0.50–$1.00/hr.
  - Enterprise GPUs (A100/H100): $1.50–$3.00/hr.
- **Pros**: Competitive pricing, large model marketplace.
- **Cons**: Mixed quality control, less predictable.

### OVH Cloud (budget tier)

- **Pricing Model**: Regional hourly + storage.
- **GPU Options**: Limited (RTX 4090 in selected regions).
- **Serverless**: Not native; relies on VM + script glue.
- **Best For**: Lowest-cost GPU workloads where latency flexibility exists.
- **Cost Estimate** (approx.):
  - RTX 4090: ~$0.40–$0.80/hr.
- **Pros**: Cheapest GPU options in EU regions.
- **Cons**: Smaller GPU catalog, more operational overhead.

### AWS Lambda (reference)

- **Pricing Model**: Per-request + compute-time.
- **Serverless**: Native.
- **GPU Options**: GPU Lambda layers available, cold-start penalty applies.
- **Best For**: Existing-AWS shops that need hybrid inference + data egress within one bill.
- **Cost Estimate**: Complex; reference AWS Lambda pricing page.
- **Pros**: Mature, integrated with rest of AWS.
- **Cons**: Cold starts hurt GPU workloads, complex pricing.

## Recommendation for Loop-Lore

Given the nature of Loop-Lore (RPG chat application with LLM inference):

1. **Primary Choice: RunPod**
   - **Why**: Native serverless support aligns perfectly with making the inference service scalable and cost-efficient.
   - **Use Case**: Deploy llama-swap/llama.cpp pods as serverless functions behind the loop-lore server.
   - **Expected Cost**: ~$20–$40/hr for standard inference workloads.
   - **Justification**: Simpler operations, easier to scale up/down based on traffic, good GPU variety.
2. **Secondary Option: Lambda Labs**
   - **Why**: Better GPU performance per dollar for steady workloads.
   - **Use Case**: Predictable high-throughput inference needing maximum performance.
   - **Expected Cost**: ~$30–$60/hr for similar workloads.
3. **Alternative: OVH Cloud**
   - **Why**: Budget-friendly GPU options.
   - **Use Case**: Lowest-possible-cost workloads where latency flexibility exists.
   - **Caveat**: More operational overhead.

## Deployment Considerations

### GPU Requirements for Loop-Lore

- **Inference**: LFM / Llama models typically run well on RTX 3090/4090.
- **Recommendation**: RTX 4090 (24 GB) for best balance of price/performance.
- **Training**: A100/H100 if you plan to train custom models.

### Network Sharing Needs

- If you plan to share state between inference pods (e.g., session cache in Redis):
  - RunPod: use network volumes for state sharing.
  - Lambda Labs: cluster networking or shared volumes.
  - OVH: private network or VPN setups.

### Networking Architecture

- For cross-pod communication (chat list updates, user presence):
  - Use gRPC / WebSocket over encrypted channels.
  - Consider Redis / PostgreSQL for shared state.
  - RunPod's serverless functions support these protocols natively.

## Acceptance Criteria

- Document published at `docs/infrastructure/hosting-comparison.md`.
- Document includes the unified Provider / Best For / Key Advantages / Key Limitations matrix (RunPod, Lambda Labs, Vast.ai, OVH Cloud, AWS Lambda).
- Per-provider pricing models, GPU options, serverless support, network-sharing notes, pros/cons are documented for each row.
- Primary (RunPod), Secondary (Lambda Labs), Alternative (OVH Cloud) recommendation block names workload fit, expected cost/hr, and justification.
- Cross-linked from `epic-deployment-infrastructure.md`, `TASK-003-gpu-requirements.md`, and `TASK-003-evaluate-hostings.md`.

## Related Files

- `docs/infrastructure/hosting-comparison.md` — primary deliverable.
- `docs/infrastructure/evaluate-hostings.md` — companion research (TASK-003-evaluate-hostings).
- `docs/infrastructure/gpu-requirements.md` (see TASK-003-gpu-requirements) — pricing inputs reused here.
- `docs/infrastructure/gpu-separation.md` (see TASK-003-gpu-separation) — service-boundary diagram references these tiers.
- `docs/infrastructure/benchmark-results.csv` — raw latency + cost data.

## Next Steps

1. Prototype on RunPod — deploy a test pod with llama-swap/llama.cpp.
2. Benchmark latency — measure inference latency with realistic payload sizes.
3. Calculate monthly cost — based on expected traffic (e.g., 50 concurrent users, 100 req/hour).
4. Evaluate data transfer — consider if inference traffic is internal (between servers) or external (public API).
5. Final decision — choose provider based on cost vs. operational simplicity.

## References

- [RunPod Pricing](https://www.runpod.io/pricing)
- [Lambda Labs Pricing](https://lambda.labs/pricing)
- [Vast.ai Pricing](https://vast.ai/pricing)
- [OVH Cloud GPU Instances](https://www.ovhcloud.com/en/public-cloud/bare-metal/)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)

## Notes

- Sibling cross-links: `TASK-003-gpu-requirements.md`, `TASK-003-gpu-separation.md`, `TASK-003-evaluate-hostings.md`.
- Open question: drop AWS Lambda row to keep the matrix tight, or keep it for completeness?
- Original ticket noted a YAML-style `<br/>` separator inside table cells; the rewrite collapses that into a single row per provider for readability.

git issue: b7d387d
