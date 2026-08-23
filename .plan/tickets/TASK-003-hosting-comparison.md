<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Hosting Provider Comparison for Loop-Lore Deployment

**Date**: 2026-08-14  
**Project**: loop-lore (RPG chat application)
**Focus**: CPU instances for serverless requests to llama-swap/llama.cpp pods, GPU compute options, network sharing

## Executive Summary

| Provider | Best For | Key Advantages | Key Limitations |
|----------|----------|-----------------|------------------|
| **RunPod** | Serverless inference, flexible GPU options, managed serverless | • Pay-per-second compute (no upfront cost)<br>• Built-in serverless functions<br>• Easy GPU scaling (RTX, A100, H100)<br>• Simple network sharing between pods<br>• Good for variable workloads | • Less mature than AWS/GCP<br>• Limited free tier<br>• Pricing varies by region |
| **Lambda Labs** | High-performance GPU inference, consistent performance | • Competitive GPU pricing (~$1.29/hr baseline)<br>• Strong performance for LLM workloads<br>• Enterprise-grade infrastructure<br>• Good for steady-state inference | • Higher hourly rates than RunPod for GPU seats<br>• Less flexible serverless options |
| **Vast.ai** | Cost-sensitive GPU compute, marketplace variety | • Competitive GPU pricing (often lower than Lambda)<br>• Large model marketplace<br>• Flexible compute options | • Variable quality across providers<br>• Less predictable pricing |
| **OVH Cloud** | Budget-conscious, regional presence | • Cheapest GPU options in some regions<br>• Broad data center network | • Limited regions<br>• Fewer GPU instance types |
| **AWS Lambda** | Existing AWS ecosystem, hybrid deployments | • Mature, reliable<br>• Can integrate with existing AWS infra | • Cold starts for GPU workloads<br>• Complex pricing model |

## Detailed Analysis

### RunPod

- **Pricing Model**: Pay-per-second serverless compute (no upfront costs)
- **GPU Options**: RTX series, A100, H100, RTX 4090
- **Serverless Functions**: Yes - can run llama.cpp pods as serverless functions
- **Network Sharing**: Supported via network volumes and pod-to-pod connections
- **Best For**: Variable inference workloads, serverless-first architecture
- **Cost Estimate** (approx. for 24/7 inference):
  - RTX 4090 ~$0.50-$1.00/sec → ~$14-$28/hr
  - A100 ~$1.50-$3.00/sec → ~$42-$84/hr
- **Pros**: Simplest serverless experience, good GPU variety, easy networking
- **Cons**: Less mature than AWS/GCP, limited free tier

### Lambda Labs

- **Pricing Model**: GPU hourly rates + storage + network
- **GPU Options**: A100, H100, RTX variants
- **Serverless**: Not primarily serverless; more focused on GPU clusters
- **Network Sharing**: Via cluster networking
- **Best For**: Steady-state GPU inference, training + inference
- **Cost Estimate** (approx.):
  - A100 ~$1.29/hr (based on benchmark)
  - H100 ~$2.50+/hr
- **Pros**: Excellent GPU performance, strong community
- **Cons**: Higher hourly rates, less serverless-oriented

### Vast.ai

- **Pricing Model**: Per-hour GPU rentals + spot instances
- **GPU Options**: Wide range from consumer to enterprise GPUs
- **Network Sharing**: Via shared volumes
- **Best For**: Cost optimization, flexible GPU selection
- **Cost Estimate** (approx.):
  - Consumer GPUs: $0.50-$1.00/hr
  - Enterprise GPUs (A100/H100): $1.50-$3.00/hr
- **Pros**: Competitive pricing, large model marketplace
- **Cons**: Mixed quality control, less predictable

## Recommendation for Loop-Lore

Given the nature of Loop-Lore (RPG chat application with LLM inference):

1. **Primary Choice: RunPod**
   - Why: Native serverless support aligns perfectly with making the inference service scalable and cost-efficient
   - Use Case: Deploy llama-swap/llama.cpp pods as serverless functions behind the Makein server
   - Expected Cost: ~$20-$40/hr for standard inference workloads
   - Justification: Simpler operations, easier to scale up/down based on traffic, good GPU variety

2. **Secondary Option: Lambda Labs**
   - Why: Better GPU performance per dollar for steady workloads
   - Use Case: If you have predictable high-throughput inference needing maximum performance
   - Expected Cost: ~$30-$60/hr for similar workloads

3. **Alternative: OVH Cloud**
   - Why: Budget-friendly GPU options
   - Use Case: If you need the lowest possible costs
   - Caveat: More operational overhead

## Deployment Considerations

### GPU Requirements for Loop-Lore

- **Inference**: LFM/Llama models typically run well on RTX 3090/4090
- **Recommendation**: RTX 4090 (24GB) for best balance of price/performance
- **Training**: A100/H100 if you plan to train custom models

### Network Sharing Needs

- If you plan to share state between inference pods (e.g., session cache in Redis):
  - RunPod: Use network volumes for state sharing
  - Lambda Labs: Cluster networking or shared volumes
  - OVH: Private network or VPN setups

### Networking Architecture

- For cross-pod communication (chat list updates, user presence):
  - Use gRPC/WebSocket over encrypted channels
  - Consider Redis/PostgreSQL for shared state
  - RunPod’s serverless functions support these protocols natively

## Next Steps

1. **Prototype on RunPod** - Deploy a test pod with llama-swap/llama.cpp
2. **Benchmark Latency** - Measure inference latency with realistic payload sizes
3. **Calculate Monthly Cost** - Based on expected traffic (e.g., 50 concurrent users, 100 req/hour)
4. **Evaluate Data Transfer** - Consider if inference traffic is internal (between servers) or external (public API)
5. **Final Decision** - Choose provider based on cost vs. operational simplicity

## References

- [RunPod Pricing](https://www.runpod.io/pricing)
- [Lambda Labs Pricing](https://lambda.labs/pricing)
- [Vast.ai Pricing](https://vast.ai/pricing)
- [Hosting Provider Comparison](https://r.search.yahoo.com/_ylt=AwrFeHYuDX9qOAIAyLtXNyoA;_ylu=Y29sbwNiZjEEcG9zAzUEdnRpZAMEc2VjA3Ny/RV=2/RE=1787920943/RO=10/RU=https%3a%2f%2fgputracker.dev%2flambda-labs-vs-vastai/RK=2/RS=VKJTbw7yMXlLFP3jjcpacPta8bU-)

git issue: b7d387d
