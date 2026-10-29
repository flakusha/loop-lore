<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-memory-kg-recall-datalog-rules

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:**

Owner epic: `.plan/epics/epic-memory-knowledge-systems.md`

## Background

- Only graph today is the asset endpoint: `src/routes/analytics/knowledge-graph.ts:22` (`knowledgeGraphHandler()` over `asset_links`; no traversal, no rules).
- Memory pipeline is flat: `src/memory/provision.ts:63-95` (`provisionMemories()` privacy/scope filter + token budget); `src/memory/injection/select.ts:26-67` (sorts by `effectiveImportance`); `src/memory/audit.ts:32-50` append-only log (home for inference traces).
- Missing (grep-negative): no materializer over lore+memories, no relation-type registry, no Datalog/CEP, no spreading activation, no `inferred:true` provenance.

Established solutions: thin in-memory adjacency (`Map<id, Edge[]>` + BFS, ~100 lines, zero deps) over DataScript-style Datalog - https://www.npmjs.com/package/datascript ; Maelys embeddable TS rules API - https://datalog.maelys.dev/docs/api/typescript/ . Neo4j/Oxigraph/RDF/Z3/NATS bus all DEFERRED (heavy infra for zero current multi-hop queries).

## Change

1. `src/memory/graph.ts` - `buildWorldGraph(db, worldId)` (lore+memories+actor edges with `weight, provenance, timestamp, privacy`), `traverse(seedIds, kHops)`, `shortestPath(a,b)`, relation registry (`transitive: locatedIn/implies`, `symmetric: allyOf`, `inverse: hasOwner/ownedBy`).
2. `src/memory/rules.ts` - minimal forward-chainer: lore `reveal_condition` + `knows` transitive rule, threshold-gated (>=0.6), `inferred:true` + `inference_trace` via `recordAuditLog`.
3. Recall wiring - spreading-activation scorer (`activation x edge weight x decay`) expands candidates post-`provisionMemories`, pre-`selectMemoriesForInjection`; scope/privacy filters first.
4. Tests - diamond/contradiction fixtures (`contradicts` blocks inference), cycle termination, privacy (secret never leaks across scope), trace present.

## Acceptance

- Multi-hop query (character knows X, X implies Y) recalls Y with `inferred:true` + rule id in trace; flat-only baseline does not.
- `contradicts` edge suppresses inference; cyclic graph terminates; per-query subgraph build O(edges) with cap.
- No new runtime dependency; no schema change beyond nullable `inferred` provenance columns; existing provision/injection tests still green.

**Caveats:** TOCTOU: graph snapshot per query, concurrent writes must not mutate traversed adjacency. Security/privacy: scope/privacy filters BEFORE spread; inferred facts inherit most restrictive provenance. Authorization: rule evaluation server-side only. Partial failure: engine error degrades to flat recall, never fails request. Rollback: inferred facts derived, never persisted as primary. Stale state: cap hops + edges. Observability: every inference writes `inference_trace` to audit log.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
