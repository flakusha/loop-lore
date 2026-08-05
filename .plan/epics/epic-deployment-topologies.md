# Epic 25: Deployment Topologies & Packaging — Implementation Plan

**Status:** Draft — description under `tree/chore-docs-reconcile` (docs chore)\
**Proposed Epic Branch:** `epic/25`\
**Owner:** TBD\
**Depends on:** Epic 26 (reconciliation guards) — hard prerequisite. Epic 25 and Epic 27 are independently sequenced after Epic 26 (suggested order: 26 → 27 → 25); neither lists the other as a dependency.

---

## Current State Assessment

| Area                     | File(s)                                                       | State  | Notes                                                                  |
| ------------------------ | ------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Build                    | `src/build/*`, `package.json` (`bun run build`)               | ✅     | `dist/server.js` + pre-compressed static assets. No build step in dev. |
| Docker (single instance) | `docs/spec/build-deploy.md`                                   | ✅ doc | Dockerfile (oven/bun) + compose (app + Postgres, **1 app instance**).  |
| Kubernetes               | —                                                             | ❌     | No manifests, no Helm, no init-migration job.                          |
| Deploy guide             | `docs/guide/installation.md`, `docs/guide/getting-started.md` | ✅     | Solo/local only. No multi-instance guide.                              |
| Health endpoint          | —                                                             | ❌     | No `/health` or `/health/schema` endpoint (needed by K8s probes).      |

---

## Deployment Topologies (scope)

| ID | Topology                  | Backend                           | Instances                | Use case                 |
| -- | ------------------------- | --------------------------------- | ------------------------ | ------------------------ |
| A  | Local solo                | SQLite                            | 1 (Bun process)          | Dev, single-user, demo   |
| B  | Single container / binary | SQLite                            | 1                        | Self-hosted, one machine |
| C  | Docker Compose            | Postgres                          | 1 app + 1 PG             | Small self-host, easy    |
| D  | Reverse proxy + N app     | Postgres                          | N app + 1 PG (or pooler) | Multi-user, single node  |
| E  | Kubernetes                | Postgres (StatefulSet or managed) | N replicas + Ingress     | Production, HA           |

**Hard rule (enforced by Epic 27):** Topologies D and E require `type=postgres`. SQLite is single-writer — valid only for A/B. Mixing SQLite + N instances is rejected at startup.

---

## Implementation Phases

### Phase 1 — Docker Hardening

| Task                                                         | Files                            | Effort |
| ------------------------------------------------------------ | -------------------------------- | ------ |
| Non-root user, read-only layers where possible               | `Dockerfile`                     | Low    |
| `HEALTHCHECK` hitting `/health` (added in Epic 26/27)        | `Dockerfile`                     | Low    |
| Compose variant for N app replicas + PG + nginx (topology D) | `docker-compose.yml` (extend)    | Low    |
| Document A–D in `docs/guide/deployment.md`                   | `docs/guide/deployment.md` (new) | Med    |

### Phase 2 — Kubernetes Packaging

| Task                                                                  | Files                               | Effort |
| --------------------------------------------------------------------- | ----------------------------------- | ------ |
| Deployment (N replicas, probes), Service, Ingress                     | `deploy/k8s/*.yaml` (new)           | Med    |
| PG as StatefulSet **or** ExternalName to managed PG (both documented) | `deploy/k8s/postgres.yaml` (new)    | Med    |
| Init Job / helm hook for migration leadership before app rollout      | `deploy/k8s/migrate-job.yaml` (new) | Med    |
| Raw manifests first; Helm/kustomize deferred                          | —                                   | —      |

### Phase 3 — Health & Observability for Orchestrators

| Task                                                                                  | Files                        | Effort |
| ------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| `/health` (liveness) + `/health/ready` (readiness gated on schema-ready from Epic 26) | `src/routes/health.ts` (new) | Med    |
| `/health/schema` reporting drift state (Epic 26)                                      | `src/routes/health.ts`       | Low    |
| K8s probe wiring + kind-cluster smoke in CI                                           | `deploy/k8s/`, CI            | Low    |

---

## Open Questions

1. **K8s deliverable:** raw manifests vs Helm vs kustomize? Recommend raw manifests first.
2. **Managed PG vs in-cluster:** support both, document both? Recommend yes.
3. **Registry/publish:** do we publish an image to a registry, or build-from-source only?

---

## Recommended Priority

1. Phase 3 (`/health`) — unblocks K8s probes, cheap.
2. Phase 1 (Docker hardening) — enables C/D now.
3. Phase 2 (K8s) — enables E once Epic 26/27 land.

---

## Next Steps

1. Promote to git EPIC issue (`epic/25`).
2. Resolve Open Questions (1, 2).
3. Phase 3 spike: `/health` + readiness gate.

---

## Dependencies

- Present: build pipeline, Dockerfile, compose (single instance).
- New: none required for raw YAML; optional Helm later.

## Testing Strategy

| Test      | Coverage                                             | Files                              |
| --------- | ---------------------------------------------------- | ---------------------------------- |
| Container | image builds, non-root, healthcheck passes           | CI (`docker build` + `docker run`) |
| K8s       | `kubectl apply` + rollout + schema-ready gate (kind) | `deploy/k8s/` + CI                 |
| E2E       | topology D smoke (nginx + 2 app + PG)                | `tests/e2e/deploy/*.test.ts` (new) |

## References

- `docs/spec/build-deploy.md` — current deploy spec (single-instance)
- `docs/spec/architecture.md` — multi-process note, session-in-DB
- Epic 26 (Multi-Instance Reconciliation) — migration leadership, drift
- Epic 27 (Data Integrity & ACID) — backend guards, ACID matrix
- `.plan/implementation-plan.md` — epic registry

## Related Epics

- **Epic 26 (Multi-Instance Reconciliation)** — provides migration leadership / schema-drift guards this epic consumes for topologies D/E.
- **Epic 27 (Data Integrity & ACID)** — supplies backend-selection + `data_version` guards that gate SQLite-vs-Postgres topology decisions.
- **Epic 14 (Import/Export)** — deploy artifacts may ship baked data; out of scope here.

## Linked Tasks

- TASK-deployment-topologies.md
