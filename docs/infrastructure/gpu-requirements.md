<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# GPU Instance Requirements — Sizing Matrix

Companion to `evaluate-hostings.md` (which carries pricing + benchmarks) and `TASK-003-gpu-requirements.md` (the original ticket). This file is the **sizing matrix** that drives the P3 / P4 / P5 cost numbers.

> **Authoritative source:** `src/` + AGENTS.md. The matrix reflects measured loop-lore workload characteristics and may drift with code changes.

---

## 1. Tier Definitions

### 1.1 P3 — dev

- **Audience:** solo / small-team development, demos, CI runners.
- **Workload:** occasional chat generations, model-loading experiments, test fixtures.
- **Concurrency:** 1-3 active chat completions.
- **SLO:** TTFT p95 < 600 ms acceptable; ITL p95 < 80 ms acceptable.

### 1.2 P4 — steady

- **Audience:** small production deployment (~50-500 active users).
- **Workload:** mixed chat generations + non-LLM traffic.
- **Concurrency:** 5-15 active chat completions.
- **SLO:** TTFT p95 < 350 ms; ITL p95 < 50 ms.

### 1.3 P5 — peak burst

- **Audience:** scale-up event, marketing campaign, federation traffic.
- **Workload:** high concurrency; multiple models; multi-region.
- **Concurrency:** 30-80 active chat completions.
- **SLO:** TTFT p95 < 250 ms; ITL p95 < 45 ms.

---

## 2. CPU Sizing

| Tier | vCPU | RAM  | Notes |
| ---- | ---- | ---- | ----- |
| **P3**  | 4    | 8 GB  | Bun + SQLite + local llama-cpp single model |
| **P4**  | 8    | 32 GB | Bun + Postgres or larger SQLite + dedicated GPU host |
| **P5**  | 16   | 64 GB | Bun × 2 + Redis + Postgres + multiple GPU hosts behind it |

---

## 3. GPU Sizing

| Tier | GPU model                          | VRAM  | Concurrent 8B streams | Concurrent 13B streams | Notes |
| ---- | ---------------------------------- | ----- | --------------------- | ---------------------- | ----- |
| **P3**  | RTX 4090                       | 24 GB | 1-3                   | 1                      | Single model; Q4_K_M |
| **P4**  | RTX 4090 / A5000 / A6000       | 24-48 GB | 5-10               | 3-5                    | One consumer or workstation card |
| **P5**  | 1-2× A100 80 GB or 1-2× H100  | 80 GB+ | 30+                 | 15+                    | Multi-pod + model cache preloaded |

---

## 4. Storage Sizing

| Tier | System | Data NVMe | Object (cold assets) | Notes |
| ---- | ------ | --------- | -------------------- | ----- |
| **P3**  | 50 GB SSD  | 100 GB          | 50 GB Spaces   | Single disk |
| **P4**  | 100 GB NVMe | 1 TB RAID-1  | 200 GB Spaces  | DB + GGUF + prompt cache |
| **P5**  | 100 GB NVMe | 2 TB RAID-1  | 500 GB Spaces  | Multi-host; per-host model cache |

GGUF model storage budget (2026-09-22):

| Model             | Q4_K_M size | Q5_K_M size | Q8_0 size |
| ----------------- | ----------- | ----------- | --------- |
| Llama-3.1-8B     | 4.9 GB      | 5.7 GB      | 8.5 GB    |
| Llama-2-13B      | 7.9 GB      | 9.2 GB      | 13.5 GB   |
| LFM-1.2B         | 0.7 GB      | 0.9 GB      | 1.3 GB    |
| Llama-3.1-70B    | 43 GB       | 50 GB       | 74 GB     |

---

## 5. Network Sizing

| Tier | Egress | Inter-pod bandwidth | Inter-region | Notes |
| ---- | ------ | ------------------- | ------------ | ----- |
| **P3**  | 5 TB/mo   | n/a (single host)   | n/a          | Single-server topology |
| **P4**  | 10 TB/mo  | 1 Gbps intra-DC     | 50 Mbps      | Two-node topology |
| **P5**  | 50 TB/mo  | 10 Gbps intra-DC    | 200 Mbps     | Three-node + GPU pool |

---

## 6. Database Sizing

| Tier | Engine       | RAM budget  | Storage  | Connections |
| ---- | ------------ | ----------- | -------- | ----------- |
| **P3**  | SQLite    | shared      | 100 GB   | 1 (single-writer) |
| **P4**  | Postgres  | 8 GB shared_buffers | 500 GB | 50 |
| **P5**  | Postgres + Redis | 24 GB shared_buffers + 16 GB Redis | 2 TB | 500 |

---

## 7. Cost-per-tier (see `evaluate-hostings.md` §5 for full table)

| Tier | RunPod | Lambda Labs | Hetzner (CPU-only) |
| ---- | ------ | ----------- | ------------------ |
| **P3**  | $24    | n/a         | $14                |
| **P4**  | $432   | $450        | $58 (no GPU)       |
| **P5**  | $2,640 | $2,800      | $390 (CPU only)    |

---

## 8. Headroom Heuristics

- Pick the **next tier up** if any of:
  - Concurrent user count > 70 % of the tier ceiling.
  - p95 latency > 80 % of the SLO budget.
  - Storage > 70 % of capacity at any 30-day window.
- Pick the **next tier down** if all of:
  - Concurrent user count < 30 % of the tier floor.
  - p95 latency < 50 % of the SLO budget.
  - Storage < 30 % of capacity.

These are heuristics; back them with your own measurements.

---

## 9. Cross-links

- `evaluate-hostings.md` — recommendation block, pricing table, latency summary
- `hosting-comparison.md` — qualitative per-provider analysis
- `benchmark-results.csv` — raw numbers
- `epic-resource-provision.md` — sizing policy
- `TASK-003-gpu-requirements.md` — original ticket

---

## 10. Change Log

- **2026-09-22:** Initial publication. Closes TASK-003-gpu-requirements.
