# TASK-003: Evaluate hosting providers (Research)

**Status**: in_progress
**Priority**: high
**Labels**: infrastructure, cloud-hosting, cost-analysis
**Epic**: epic-deployment-infrastructure
**Assignee**: Platform Team

## Research Focus

- RunPod CPU instances for Makein server with serverless requests to customized llama-swap/llama.cpp pods
- Network sharing between pods
- Alternative providers with GPU compute options

## Key Evaluation Criteria

1. **Pricing Model**
   - Hourly rate for CPU instances
   - Serverless function pricing (if applicable)
   - GPU instance pricing
   - Storage costs

2. **Performance**
   - Token latency benchmarks (llama-2/3, lfm)
   - Throughput capacity
   - Network latency between regions

3. **Features**
   - Serverless function support (e.g., RunPod Functions)
   - GPU compute capabilities
   - Network sharing capabilities
   - Persistent storage options

4. **Ease of Use**
   - API/SDK quality
   - Documentation quality
   - Provisioning time

## Target Providers

- RunPod (primary focus)
- Lambda Labs
- Vast.ai
- OVH Cloud
- Hetzner Online
- AWS EC2 (for comparison)
- Google Cloud (for comparison)
- DigitalOcean (for comparison)

## Required Deliverables

- Hosting comparison matrix
- Latency benchmark results
- Cost analysis for P3-P5 instances
- Recommendation report

## Current Findings (Preliminary)

- RunPod offers serverless functions with GPU support
- Lambda Labs has strong GPU instances but higher costs
- Vast.ai provides GPU marketplace with varying quality
- Hetzner has affordable VPS but limited GPU options
- AWS/GCP may be overkill for our needs but good for benchmarking

## Next Steps

1. Benchmark RunPod CPU instances with llama.cpp workload
2. Test network sharing between pods on RunPod
3. Compare GPU instance pricing across providers
4. Evaluate serverless function limitations

Would you like me to focus on any specific aspect of this research first?