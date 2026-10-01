<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — schedule Mesh / Federation Interconnect batch (post content-sharing)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-worktree-plan-tooling.md
**Type:** Task
**Summary:** The 9-issue Mesh/Federation Interconnect cluster (open-untriaged.md § New clusters) is unblocked now that encrypted content-sharing is in flight. Each issue already has an explicit epic home (epic-federation-swarm-sync.md, epic-mesh-federation-content-sharing.md, epic-certificate-and-tls-management.md). This ticket captures the batch into one tracking ticket so the work is scheduled together, not re-mined piecemeal.
**Context:** Nine git issues: 6bf6ddc peer-config (already done as TASK-federation-interconnect-peer-config), e23054f instance-state advertisement, 2e34de8 observability config, 7c8cf4b liveness/readiness, 8f695c2 prometheus metrics, d6d3793 nodeinfo/well-known, 271e08d SPKI pin verification, 035958e DEK re-wrap, 41f4f83 content-clearance gate. Per priority-P4 § P5 list, the work is queued after encrypted sharing lands.

## Issues in scope

| Git issue | Topic | Epic |
| --- | --- | --- |
| e23054f | instance-state advertisement | epic-federation-swarm-sync.md |
| 2e34de8 | observability config | epic-federation-swarm-sync.md |
| 7c8cf4b | liveness/readiness | epic-federation-swarm-sync.md |
| 8f695c2 | prometheus metrics | epic-federation-swarm-sync.md |
| d6d3793 | nodeinfo/well-known | epic-federation-swarm-sync.md |
| 271e08d | SPKI pin verification | epic-certificate-and-tls-management.md |
| 035958e | DEK re-wrap | epic-mesh-federation-content-sharing.md |
| 41f4f83 | content-clearance gate | epic-mesh-federation-content-sharing.md |

**Acceptance Criteria:**

- [ ] Each of the 8 issues has a one-line ticket file (or pointer to an existing ticket) under its assigned epic.
- [ ] Execution order documented in the parent epic: SPKI pinning → liveness/readiness → nodeinfo → metrics → DEK re-wrap → content-clearance gate (security-first ordering).
- [ ] index.json updated via plan:sync:fix so the body-level Epic: fields are reflected.
- [ ] No duplicate epic created (open-untriaged.md § 2026-09-25 explicitly forbids).

**Tags:** federation, mesh, swarm, observability, tls, certificate
**Related:** .plan/backlog/open-untriaged.md § New clusters, .plan/epics/epic-federation-swarm-sync.md, .plan/epics/epic-mesh-federation-content-sharing.md, .plan/epics/epic-certificate-and-tls-management.md


git issue: efca0be
