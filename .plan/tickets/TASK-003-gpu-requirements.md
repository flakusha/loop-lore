<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# GPU Instance Recommendations for Loop-Lore Development

## Minimum Requirements

- **GPU**: NVIDIA RTX 4090 (24GB VRAM)
- **CPU**: Intel i7-12700K or AMD Ryzen 7 7800X3D
- **RAM**: 64GB DDR5
- **Storage**: 1TB NVMe SSD
- **Network**: 1Gbps+ bandwidth

## Recommended Configurations

| Provider | Instance Type | GPU | Price (Approx.) | Use Case |
|-----------|----------------|-----|------------------|----------|
| RunPod | RTX 4090 (24GB) | NVIDIA A100 40GB | $0.50/sec | Serverless inference |
| Lambda Labs | A100 40GB | A100 80GB | $1.29/hr | Steady-state inference |
| Vast.ai | RTX 3090 (24GB) | RTX 4090 24GB | $0.50-1.00/hr | Cost-sensitive workloads |
| OVH Cloud | RTX 4090 (24GB) | RTX 4090 24GB | $0.40-0.80/hr | Budget-friendly GPUs |

## Validation Criteria

1. **SDXL Workflow**
   - 4090 handles 2K upscales at 20fps
   - 5090 preferred for 4K workflows
2. **Anima Integration**
   - 6000+ VRAM for animation rendering
   - PRO 6000 handles 4K+ animation streams
3. **Krea 2 Optimization**
   - 4090 achieves 120fps with SDXL
   - 5090 required for batch processing
4. **Minimax H3**
   - 4090 meets real-time generation
   - PRO 6000 handles 8K video AI

## Cost Analysis

- **24/7 Inference**
  - RunPod: $360/month (4090)
  - Lambda Labs: $920/month (A100)
- **Peak Load Handling**
  - PRO 6000 recommended for >10 concurrent users
  - 5090 + 2x 4090 cluster for extreme scaling

## Deployment Strategy

1. **Base Layer**: RunPod RTX 4090 for serverless inference
2. **High-Volume Layer**: Lambda Labs A100 for batch processing
3. **Edge Layer**: OVH RTX 4090 for regional caching
4. **Backup**: Vast.ai for cost-sensitive tasks

## Maintenance Plan

- Weekly GPU memory monitoring
- Monthly driver updates
- Quarterly hardware refresh cycle
- Annual stress testing for SDXL/Anima workloads

## Risk Mitigation

- GPU failure redundancy
- Storage redundancy for animation files
- Network failover for real-time generation
- Auto-scaling policies for traffic spikes

## References

- [NVIDIA RTX 4090 Specs](https://www.nvidia.com/en-us/geforce/graphics-cards/rtx-4090/)
- [Lambda Labs GPU Benchmarks](https://lambda.labs/benchmarks)
- [Vast.ai Provider Ratings](https://vast.ai/benchmark)