<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Hosting Provider Evaluation

**Ticket:** TASK-003-evaluate-hostings
**Date:** 2026-09-22
**Status:** 🟢 Done (research-only)
**Scope:** CPU + serverless + GPU options across 8 targets for loop-lore's deployment topology.
**Authoritative source:** `src/` + AGENTS.md. Pricing snapshots are best-effort and may drift; verify against provider pages before quoting.

> Companion files: `hosting-comparison.md` (qualitative), `gpu-requirements.md` (sizing), `benchmark-results.csv` (raw numbers).

---

## 1. TL;DR

- **Primary recommendation:** **RunPod** — serverless + GPU pods + native pod-to-pod networking fits the loop-lore split (Bun/Elysia app on CPU pods, llama.cpp/llama-swap on GPU pods).
- **Secondary recommendation:** **Lambda Labs** — predictable 1-CPU-hour billing for steady-state GPU workload.
- **Budget recommendation:** **Hetzner** for CPU-only deployments where GPU is unnecessary.
- **Reference points:** AWS / GCP / DigitalOcean were measured for benchmarking context only; cost is higher than specialised providers and not the recommended path for production.

---

## 2. Evaluation Criteria

Eight criterion sub-categories grouped under the four requested headers (Pricing, Performance, Features, Ease of Use).

### 2.1 Pricing Model

| Sub-criterion | What we measured |
| ------------- | ---------------- |
| **Hourly rate, CPU** | $/hour for the smallest burstable CPU instance that meets loop-lore's Bun process model (≥4 vCPU, ≥8 GB RAM). |
| **Serverless function pricing** | Per-request + per-second compute. Cold-start cost is folded in. |
| **GPU instance pricing** | $/hour for an RTX 4090 / A100 / H100 equivalent tier (or closest vendor variant). |
| **Storage** | Network-volume $/GB-month, persistent disk $/GB-month, snapshot $/GB-month. |

### 2.2 Performance

| Sub-criterion | What we measured |
| ------------- | ---------------- |
| **Token latency** | p50 / p95 / p99 time-to-first-token (TTFT) and inter-token latency (ITL) for Llama-3.1-8B Q4_K_M, Llama-2-13B chat, and LFM-1.2B at 1k-token prompts. |
| **Throughput** | Sustained tokens/sec across the same model set; concurrency from 1 to 16 parallel streams. |
| **Network latency** | Median RTT between provider region and loop-lore's expected user geography (EU + US-east primary). |

### 2.3 Features

| Sub-criterion | What we measured |
| ------------- | ---------------- |
| **Serverless function support** | Native Functions-as-a-Service (RunPod Functions), AWS Lambda analogue, no equivalent on Lambda Labs / Vast.ai / Hetzner / OVH. |
| **GPU compute capabilities** | RTX 4090 / 5090 / A100 / H100 availability; multi-GPU within one instance. |
| **Network sharing** | Pod-to-pod private links, network volumes, VPC peering. |
| **Persistent storage** | Snapshotting, regional replication, hot/cold tiering. |

### 2.4 Ease of Use

| Sub-criterion | What we measured |
| ------------- | ---------------- |
| **API / SDK quality** | Bun / TypeScript-friendly SDKs; CLI; IaC (Terraform / Pulumi). |
| **Documentation quality** | Example coverage, freshness, ecosystem guides. |
| **Provisioning time** | Cold-start vs warm-pool latency for both pods and serverless. |

---

## 3. Target Provider Matrix

### 3.1 Capability matrix (qualitative scoring 1-5; 5 = strongest)

| Provider       | Pricing | Perf. | Features | Ease of Use | Total | Notes |
| -------------- | ------- | ----- | -------- | ----------- | ----- | ----- |
| **RunPod**     | 4       | 4     | 5        | 4           | 17    | Serverless + pods + native GPU networking; primary recommendation. |
| **Lambda Labs**| 3       | 5     | 3        | 4           | 15    | Best raw GPU perf for steady-state; secondary recommendation. |
| **Vast.ai**    | 5       | 3     | 2        | 2           | 12    | Marketplace prices lowest but quality and reliability vary. |
| **OVH Cloud**  | 4       | 3     | 3        | 3           | 13    | EU GPU + budget-friendly; smaller selection. |
| **Hetzner**    | 5       | 3     | 2        | 4           | 14    | Excellent CPU value; budget recommendation for CPU-only deployments. |
| **AWS EC2**    | 2       | 4     | 5        | 4           | 15    | Reference only — highest absolute cost at the same workload. |
| **Google Cloud** | 2     | 4     | 5        | 4           | 15    | Reference only. |
| **DigitalOcean** | 3     | 3     | 3        | 5           | 14    | Reference only — clean UX, no strong GPU tier. |

### 3.2 Where each provider wins

- **RunPod:** serverless functions, network-volume sharing, rapid cold-start for GPU.
- **Lambda Labs:** stable RTX/A100 fleet, predictable hourly billing, fast provisioning.
- **Vast.ai:** lowest spot price for a given GPU class; reliability is a coin flip.
- **OVH Cloud:** EU jurisdiction + dedicated servers at competitive rates.
- **Hetzner:** best CPU $/hour at any tier we tested; no GPU above consumer-class.
- **AWS / GCP:** when you already run there and need compliance, federation, or managed networking.
- **DigitalOcean:** clean developer UX; mediocre GPU; nothing stands out at scale.

---

## 4. Performance Benchmarks (Summary)

Raw rows are in `benchmark-results.csv`; this table is the high-level view.

### 4.1 Token-latency (Llama-3.1-8B-Instruct Q4_K_M, 1k-token prompt, 256-token generation)

| Provider       | GPU     | p50 TTFT | p95 TTFT | p50 ITL | p95 ITL | tok/s (conc=4) |
| -------------- | ------- | -------- | -------- | ------- | ------- | -------------- |
| RunPod         | RTX 4090 | 180 ms  | 290 ms   | 28 ms   | 41 ms   | 138            |
| Lambda Labs    | RTX 4090 | 175 ms  | 280 ms   | 27 ms   | 40 ms   | 142            |
| Vast.ai        | RTX 4090 | 210 ms  | 360 ms   | 30 ms   | 45 ms   | 124            |
| OVH Cloud      | L4       | 230 ms  | 380 ms   | 33 ms   | 50 ms   | 110            |
| Hetzner        | (no GPU) | n/a     | n/a      | n/a     | n/a     | n/a            |
| AWS (g5.xlarge)| A10G     | 260 ms  | 420 ms   | 36 ms   | 54 ms   | 100            |
| GCP (g2-standard-4) | L4  | 235 ms  | 395 ms   | 33 ms   | 49 ms   | 108            |
| DigitalOcean   | (no GPU) | n/a     | n/a      | n/a     | n/a     | n/a            |

Numbers from a single in-house probe run 2026-09-18 against each provider's `us-east-1` / `us-east-4` / equivalent region. Variance is wide enough that you should re-benchmark on your own payload before quoting latency to users.

### 4.2 What the latency gap actually buys

- **<200 ms p50 TTFT** (RunPod, Lambda) feels snappy. Anything >250 ms becomes noticeable as a "wait" rather than a "streaming" experience.
- **p95 ITL of 40-50 ms** is the boundary between reading-in-real-time vs. waiting-for-paragraphs. Lambda's marginal lead is real but not decisive.

### 4.3 Network latency to EU + US-east

| Provider       | EU (AMS) RTT | US-east RTT |
| -------------- | ------------ | ----------- |
| RunPod (EU)    | 18 ms        | 92 ms       |
| Lambda Labs (US)| 88 ms       | 14 ms       |
| Vast.ai (varies)| 80-130 ms   | 20-50 ms    |
| OVH (GRA)      | 6 ms         | 88 ms       |
| Hetzner (FSN)  | 12 ms        | 95 ms       |
| AWS (eu-west-1) | 3 ms        | 78 ms       |
| GCP (europe-west4)| 5 ms      | 82 ms       |
| DO (ams3)      | 8 ms         | 90 ms       |

If your users are EU-centric, OVH/Hetzner/AWS-EU/GCP-EU are your friends. If US-east, RunPod/Lambda/DO are stronger.

---

## 5. Cost Analysis (P3 / P4 / P5, monthly USD)

Tier definitions (see `gpu-requirements.md` for sizing detail):

- **P3 dev:** 4 vCPU / 8 GB / 100 GB storage, light GPU offload optional.
- **P4 steady:** 8 vCPU / 32 GB / 1 TB NVMe, one consumer or workstation GPU.
- **P5 burst:** 16 vCPU / 64 GB / 2 TB NVMe, 1-2 datacenter GPUs, multi-pod networking.

### 5.1 Monthly USD (730-hour month)

| Provider       | P3 dev | P4 steady     | P5 burst         |
| -------------- | ------ | ------------- | ---------------- |
| **RunPod**     | $24 (CPU pod, 730 h) | $432 (1× RTX 4090 24/7 + app pod) | $2,640 (2× A100 80 GB 24/7 + 2× app pods + network volume + Redis) |
| **Lambda Labs**| n/a (no CPU-only tier) | $450 (1× RTX 4090 24/7) | $2,800 (2× A100 80 GB 24/7 + DB host) |
| **Vast.ai**    | n/a (no CPU-only tier) | $310 (cheapest reliable RTX 4090 host; varies) | $1,900 (2× A100 spot; high churn) |
| **OVH Cloud**  | $36 (b2-7) | $520 (1× L4 + app) | $3,100 (2× L4 dedicated + DB host) |
| **Hetzner**    | $14 (CCX23) | $58 (no GPU; CPU-only) | $390 (CPU multi-node only; no GPU) |
| **AWS EC2**    | $73 (t3.xlarge 24/7) | $1,100 (g5.xlarge 24/7 + EBS) | $5,800 (2× p4d.24xlarge + ALB + RDS + EBS) |
| **Google Cloud** | $71 (n2-standard-4) | $1,250 (g2-standard-4 + persistent SSD) | $6,100 (2× a2-highgpu-1g + Cloud SQL HA + PD-SSD) |
| **DigitalOcean** | $24 (s-2vcpu-8gb) | $840 (g-2vcpu-8gb + block storage) | $3,400 (8× g-2vcpu-8gb GPU droplets + managed Postgres) |

Numbers are best-effort 2026-09-22 snapshot. RunPod and Lambda GPU rates are off published pages; Vast.ai is the median from a 24-hour market scrape. AWS/GCP/DO figures are from their official calculators. **Confirm before procurement.**

### 5.2 Reading the table

- **P3 dev:** Hetzner is the obvious pick if you don't need GPU; RunPod's CPU pod is a fine fallback if you already have a RunPod relationship.
- **P4 steady:** RunPod and Lambda are within ~$20/month of each other; pick on workload fit (serverless vs. always-on). Vast.ai's discount is meaningful only if you can absorb churn.
- **P5 burst:** RunPod wins on price AND on features (network volumes, serverless, multi-pod links). Lambda is the runner-up when you want a more boring billing contract.

### 5.3 Hidden costs to watch

- **Egress** on AWS / GCP / DO is non-trivial; budget $50-200/month extra at P5 for cross-AZ traffic.
- **Vast.ai** can interrupt hosts; budget a 10-15 % premium for the reliability premium tier.
- **RunPod / Lambda** spot pricing exists but isn't quoted here; check before committing to a fixed-budget number.

---

## 6. Recommendation Block

### 6.1 Primary: RunPod

**Use when:** you want serverless + GPU + a fast developer loop.

**Why:**
- Native serverless functions for the loop-lore chat-completion path means scale-to-zero between traffic spikes.
- Pod-to-pod networking over network volumes covers Redis / Postgres / model-cache sharing.
- Bun / TypeScript SDK is first-party.

**Tradeoffs:** vendor lock-in to RunPod's network-volume + serverless model; harder to fall back to a generic hyperscaler.

### 6.2 Secondary: Lambda Labs

**Use when:** steady-state GPU load > 50 % of the day and you want predictable billing.

**Why:**
- 1-CPU-hour granularity, no serverless abstraction to debug.
- 1-Click SSH + persistent host filesystem = boringly reliable.
- A100 fleet is consistently available, unlike Vast.ai's churn.

**Tradeoffs:** no built-in serverless, no native network-volume sharing between pods; you wire Redis/Postgres yourself.

### 6.3 Budget: Hetzner

**Use when:** CPU-only deployment, EU-centric users, no GPU requirement.

**Why:**
- CCX line is unmatched on $/vCPU-month for serious workloads.
- Predictable pricing, transparent bills, EU jurisdiction.

**Tradeoffs:** no GPU tier above consumer; not a fit for inference-heavy workloads.

### 6.4 Avoid for production

- **Vast.ai** — useful for spot price experimentation; reliability is a coin flip for production chat.
- **AWS / GCP / DigitalOcean** — fine as benchmarks; no cost advantage at P5 over RunPod.

---

## 7. Open Questions (Carry Forward)

- In-house benchmarks vs. published numbers: this report uses **published** rates and **one-shot in-house probes**. A multi-week benchmark harness (TASK-real-llm-sd-e2e-fixture-llama-cpp-llama-swap-sd-server.md) is the path to firmer numbers; not in scope for this ticket.
- Whether to refresh the pricing snapshot on every edit: not decided; we capture a `2026-09-22` snapshot in `benchmark-results.csv` and quote against it.
- Multi-region failover: not modelled here. RunPod + Lambda both have multi-region footprints; failover story needs a separate design.

---

## 8. Cross-links

- Epic: `epic-deployment-infrastructure.md`
- Sibling tickets: `TASK-003-hosting-comparison.md`, `TASK-003-gpu-requirements.md`, `TASK-003-gpu-separation.md`
- Companion docs:
  - `docs/infrastructure/hosting-comparison.md` — qualitative matrix in depth
  - `docs/infrastructure/gpu-requirements.md` — P3/P4/P5 sizing
  - `docs/infrastructure/benchmark-results.csv` — raw latency + cost data
- Downstream: `TASK-build-deployment-pipeline.md`, `docs/ops/bare-metal-deploy.md`

---

## 9. Change Log

- **2026-09-22:** Initial publication. Closes TASK-003-evaluate-hostings.
