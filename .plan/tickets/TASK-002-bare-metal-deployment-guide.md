<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-002: Bare metal deployment guide

**Status:** 🟢 done
**Priority:** medium
**Effort:** Medium
**Summary:** Runbook at docs/ops/bare-metal-deploy.md — hardware, install, systemd, NVMe/RAID, GPU, networking, monitoring, backup.
**Context:** Ubuntu 22.04 LTS; on-prem single-server + multi-node deployment.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-deployment-infrastructure
**Labels:** ops, deployment, infrastructure
**Assignee:** Ops Team

## Summary

Document on-premises / dedicated-server deployment procedures for loop-lore, producing a runbook at `docs/ops/bare-metal-deploy.md` that covers hardware inventory, step-by-step installation, systemd unit files, NVMe/RAID/storage setup, GPU/CUDA configuration, networking, monitoring, and backup strategy.

## Context

- **Scope covered**: Single-server and multi-node on-prem or VM deployment of loop-lore (Bun / Elysia / HTMX + Alpine.js stack) on Ubuntu 22.04 LTS.
- **Inputs**: Existing deployment scripts, systemd unit templates, hardware sizing signals from `epic-resource-provision.md` and `TASK-003-gpu-requirements`.
- **Outputs**: A runbook at `docs/ops/bare-metal-deploy.md` plus companion systemd unit files and a pinned `requirements.txt`; validated on Ubuntu 22.04 LTS.

## Description

Document deployment procedures for on-premises or dedicated server environments.

## Tasks

- [x] Inventory hardware requirements (CPU, RAM, storage, GPU)
- [x] Create step-by-step installation guide
- [x] Configuration for systemd services
- [x] Storage setup (NVMe optimization, RAID, backups)
- [x] GPU setup for LLM inference (CUDA drivers, libraries)
- [x] Network configuration (port forwarding, firewall)
- [x] Monitoring and alerting setup
- [x] Backup strategy for persistent data
- [x] Documentation in Markdown format

## Acceptance Criteria

- Guide covers all deployment scenarios (single server, multi-node)
- Commands are tested on Ubuntu 22.04 LTS
- GPU setup verified with actual inference workload
- Network security recommendations included
- Runbook published at `docs/ops/bare-metal-deploy.md` and cross-linked from `docs/README.md`
- Companion `systemd/` unit files and pinned `requirements.txt` committed under `docs/ops/bare-metal/`

## Related Files

- `docs/ops/bare-metal-deploy.md` — the runbook
- `docs/ops/bare-metal/systemd/` — service unit files
- `docs/ops/bare-metal/requirements.txt` — pinned system/runtime dependencies
- `docs/ops/bare-metal/network.md` — firewall, port-forwarding, TLS notes

## Notes

- Consider documenting both bare metal and cloud VM deployment
- GPU compute section should include driver installation steps

## Resolution

Published the runbook at `docs/ops/bare-metal-deploy.md` (Ubuntu 22.04 LTS) with companion files:

- `docs/ops/bare-metal/network.md` — port allocation, ufw rules, Caddy/nginx TLS configs, ACME, federation
- `docs/ops/bare-metal/requirements.txt` — pinned apt packages with versions (jammy 2026-09-22 snapshot)
- `docs/ops/bare-metal/systemd/` — ten unit files: `loop-lore.service`, `loop-lore-worker.service`, `llama-swap.service`, `llama-cpp-server@.service`, `pg-exporter.service`, `node-exporter.service`, `backup-sqlite.service` + `.timer`, `backup-zfs-send.service` + `.timer`

Covers all checklist items and acceptance criteria:

- Hardware inventory by P3/P4/P5 tier
- Step-by-step Ubuntu 22.04 install + kernel/sysctl hardening
- systemd service templates with hardening (`NoNewPrivileges`, `ProtectSystem=strict`, etc.)
- NVMe + mdadm RAID-1 + ZFS mirror alternative
- GPU/CUDA driver selection, toolkit install, llama.cpp + llama-swap install, smoke verification
- Networking via companion `network.md` (Caddy/nginx + ACME + ufw)
- Monitoring with prometheus-node-exporter + pg-exporter + alerting thresholds
- Backup strategy: hourly logical + daily ZFS send + quarterly restore drill

Cross-linked from `docs/README.md` (new `Operations (ops/)` section).

Related tickets: `epic-deployment-infrastructure.md`, `TASK-001` (Docker), `TASK-003-evaluate-hostings.md`.