<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Hosting Provider Comparison — Qualitative

Companion to `evaluate-hostings.md` (which carries the quantitative scores, latency numbers, and the recommendation block). This file is the qualitative long-form: per-provider architecture fit, lock-in profile, and operational notes.

> **Authoritative source:** `src/` + AGENTS.md. Provider details drift; verify against provider docs.

---

## 1. RunPod

### 1.1 What it is

GPU cloud with first-class **serverless Functions** and **Pods** (long-running containers). Pods can share a **Network Volume** for fast file-level sharing; Pods in the same datacentre can talk over private IPs.

### 1.2 Fit for loop-lore

- **App tier:** Bun/Elysia CPU pods in `cpu-runner` mode; scale-to-zero via serverless where traffic is bursty.
- **GPU tier:** llama.cpp or llama-swap on a GPU pod (RTX 4090 dev, A100/H100 prod). Network volume holds GGUF + prompt cache.
- **State:** Redis / Postgres either as managed add-ons (RunPod has an internal Postgres; Redis you bring) or via external providers.

### 1.3 Lock-in profile

- Pod YAML format is RunPod-specific (port mapping, network-volume mount).
- Serverless Functions API is RunPod-specific.
- Migration off RunPod = rebuild Pod definitions for Lambda / Vast / OVH equivalents.

### 1.4 Operational notes

- Cold-start for GPU pods: 30-60 s including model load.
- Cold-start for serverless: 2-8 s, depending on image size.
- Bun/TS SDK is officially supported.
- IAM is API-key only; no native RBAC.

---

## 2. Lambda Labs

### 2.1 What it is

Dedicated GPU cloud: persistent instances billed by the CPU-hour (1-second granularity). No native serverless; no shared network volumes.

### 2.2 Fit for loop-lore

- **GPU tier:** A100 / H100 / RTX 4090 instances as primary inference workers.
- **App tier:** Lambda CPU is limited; recommended to pair with Hetzner or DO for the Bun app.

### 2.3 Lock-in profile

- Standard Linux instances + SSH + Docker. Very low lock-in.
- Migration off Lambda = same Docker Compose you ran locally.

### 2.4 Operational notes

- GPU fleet availability is reliable; spot-tier is cheaper but less guaranteed.
- Provisioning time: 30-90 s for an instance to come up.
- IAM is API-key + SSH key only.

---

## 3. Vast.ai

### 3.1 What it is

GPU marketplace. Hosts advertise spare capacity at variable prices; tenants rent by the hour. Quality and reliability vary by host.

### 3.2 Fit for loop-lore

- **GPU tier:** cost-sensitive workloads where host churn is acceptable.
- **App tier:** not relevant; Vast is GPU-only.

### 3.3 Lock-in profile

- Plain Linux instances; very low lock-in.
- Migration off Vast = re-launch the same Docker image elsewhere.

### 3.4 Operational notes

- **Reliability:** hosts can disappear mid-job. Production traffic should not depend on a single Vast host.
- **Networking:** inter-host networking is over the public internet (no private VPC).
- **Spot pricing:** varies by hour; budget a 10-15 % premium for "verified" reliability tier.

---

## 4. OVH Cloud

### 4.1 What it is

EU-headquartered hyperscaler with budget GPU instances (L4 / A100) and bare-metal dedicated servers.

### 4.2 Fit for loop-lore

- **EU-centric deployments:** GDPR-friendly, EU jurisdiction, EU-IX peering.
- **GPU tier:** L4 is the main offering; A100 in dedicated form.
- **App tier:** B2 / B3 range covers the Bun app well.

### 4.3 Lock-in profile

- Standard cloud APIs (OpenStack-derived) + their own control panel.
- Migration off OVH = rebuild via Terraform / Pulumi.

### 4.4 Operational notes

- Provisioning 1-3 min for cloud instances; longer for dedicated servers.
- Bandwidth caps on cloud instances; dedicated servers unmetered.
- IAM is RBAC + service accounts.

---

## 5. Hetzner Online

### 5.1 What it is

EU cloud with aggressive VPS pricing. No GPU tier above consumer-class (a small RTX line is available but not at scale).

### 5.2 Fit for loop-lore

- **CPU-only deployments:** unmatched $/vCPU-month at CCX tier.
- **App tier:** primary recommendation for the Bun service in P3 / P4-without-GPU topologies.
- **DB tier:** Cloud Postgres or self-hosted Postgres on dedicated servers.

### 5.3 Lock-in profile

- Standard cloud APIs + Cloud Controller.
- Migration off Hetzner = rebuild via standard tooling.

### 5.4 Operational notes

- Provisioning <60 s for cloud servers.
- 20 TB egress included on dedicated; metered on cloud.
- EU jurisdiction, GDPR-friendly.

---

## 6. AWS EC2

### 6.1 What it is

Reference only. Compute, GPU, networking, managed DB, IAM, organisation policies, multi-region.

### 6.2 Fit for loop-lore

- **Compliance:** SOC2 / HIPAA / FedRAMP when needed.
- **Federation:** VPC peering + Direct Connect for tight cross-node networking.
- **Cost:** highest at every tier we measured. Useful as a benchmark.

### 6.3 Lock-in profile

- High. AWS-specific APIs (IAM, ECS/EKS, RDS, S3, CloudWatch).
- Migration off AWS = significant re-architecture.

### 6.4 Operational notes

- Provisioning 30-90 s; spot 1-3 min.
- Egress billed per GB; budget extra for cross-AZ traffic.
- Mature RBAC + service control policies.

---

## 7. Google Cloud (GCP)

### 7.1 What it is

Reference only. Compute (N2/N2D), GPU (A2/L4), managed Postgres (Cloud SQL), networking (VPC).

### 7.2 Fit for loop-lore

- **ML:** A2 instances + TPUs if you ever want TPU inference.
- **Data:** BigQuery / GCS if your stack integrates there.
- **Cost:** same range as AWS; not recommended over RunPod for cost reasons.

### 7.3 Lock-in profile

- High. GCP-specific APIs (IAM, GKE, Cloud SQL, VPC).
- Migration off GCP = significant re-architecture.

### 7.4 Operational notes

- Provisioning 30-90 s.
- Sustained-use discounts apply automatically.
- IAM is RBAC + org policies.

---

## 8. DigitalOcean

### 8.1 What it is

Developer-friendly cloud. CPU droplets, GPU droplets (g-2vcpu-8gb + L4), managed Postgres, Spaces object storage.

### 8.2 Fit for loop-lore

- **App tier:** clean UX; good for small teams that don't want AWS/GCP overhead.
- **GPU tier:** mediocre; one L4 droplet is the only GPU tier worth naming.
- **DB tier:** managed Postgres is fine; not a HA story.

### 8.3 Lock-in profile

- Low. Standard Linux + cloud-init.
- Migration off DO = rebuild via standard tooling.

### 8.4 Operational notes

- Provisioning <60 s for droplets.
- Bandwidth generous but capped.
- IAM is project-scoped API tokens.

---

## 9. Decision Frame (Which to Pick)

| If you need...                                  | Pick |
| ----------------------------------------------- | ---- |
| Serverless + GPU + EU/US reach                  | RunPod |
| Steady-state GPU + boring billing contract      | Lambda Labs |
| CPU-only, EU, low cost                          | Hetzner |
| Reliability premium on a single tenant          | Lambda Labs / OVH dedicated |
| Already on hyperscaler + compliance mandates    | AWS / GCP |
| Quick prototype with managed Postgres           | DigitalOcean |
| Lowest possible spot price (and you tolerate churn) | Vast.ai |

---

## 10. Cross-links

- `evaluate-hostings.md` — quantitative scores, latency, cost tables, recommendation block
- `gpu-requirements.md` — P3/P4/P5 sizing matrix
- `benchmark-results.csv` — raw latency + cost data
- `epic-deployment-infrastructure.md`
- `TASK-003-evaluate-hostings.md`, `TASK-003-gpu-requirements.md`, `TASK-003-gpu-separation.md`

---

## 11. Change Log

- **2026-09-22:** Initial publication. Closes TASK-003-hosting-comparison.
