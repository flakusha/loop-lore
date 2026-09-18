<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-002: Bare metal deployment guide

**Status:** pending
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

- [ ] Inventory hardware requirements (CPU, RAM, storage, GPU)
- [ ] Create step-by-step installation guide
- [ ] Configuration for systemd services
- [ ] Storage setup (NVMe optimization, RAID, backups)
- [::-::] GPU setup for LLM inference (CUDA drivers, libraries)
- [ ] Network configuration (port forwarding, firewall)
- [::-::] Monitoring and alerting setup
- [ ] Backup strategy for persistent data
- [ ] Documentation in Markdown format

## Acceptance Criteria

- Guide covers all deployment scenarios (single server, multi-node)
- Commands are tested on Ubuntu 22.04 LTS
- GPU setup verified with actual inference workload
- Network security recommendations included
- Runbook published at `docs/ops/bare-metal-deploy.md` and cross-linked from `docs/README.md`
- Companion `systemd/` unit files and pinned `requirements.txt` committed under `docs/ops/bare-metal/`

## Related Files

- `docs/ops/bare-metal-deploy.md` (to be created) — the runbook
- `docs/ops/bare-metal/systemd/` (to be created) — service unit files
- `docs/ops/bare-metal/requirements.txt` (to be created) — pinned system/runtime dependencies
- `docs/ops/bare-metal/network.md` (to be created) — firewall, port-forwarding, TLS notes

## Notes

- Consider documenting both bare metal and cloud VM deployment
- GPU compute section should include driver installation steps