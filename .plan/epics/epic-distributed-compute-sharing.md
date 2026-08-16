<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Distributed Computing & Sharing (Contributor Compute Network)

**Status:** 🟡 Draft — analysis complete, tickets scoped
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic
**Tags:** distributed, computing, sharing, byok, gpu, inference, peer-to-peer, incentives, community
**Proposed Epic Branch:** `epic-distributed-compute-sharing`

## Summary

Let users **support the platform by sharing their own idle compute** (GPU/CPU) —
an extension of BYOK from "bring your own key/model" to "bring/share your own
compute." loop-lore becomes the hub of a contributor compute network: registered
user nodes advertise capabilities, receive generation tasks (LLM inference, SD /
ComfyUI workflows) from the platform's existing pipeline, return results, and earn
credits/priority for validated contribution.

This is the **complementary** direction to `epic-platform-integrations` Tier 3:
there the platform _rents_ GPU from third-party marketplaces (Vast.ai/RunPod, pays
money); here the platform _accepts contributions_ from its own users (rewards
credits). Gamers running an RPG chat app have idle gaming GPUs — a natural,
community-aligned capacity pool.

## Problem

Ground truth (verified 2026-08-12):

- The generation pipeline (`src/generation/`) serves LLM + SD/ComfyUI via providers
  registered in `src/generation/providers/registry.ts` (`registerProvider`,
  `resolveProvider`, `buildFailoverList`, `callWithFailover` + circuit breaker).
  Capacity = platform-owned providers only.
- **BYOK is consumption-only.** `epic-byok-api-keys.md` lets a player use _their own
  key_ for _their own requests_; `epic-byok-local-models.md` lets a player run _their
  own model_ on _their own machine_. Neither lets a user contribute capacity to the
  platform to help it serve _other_ users or reduce the operator's cost.
- **No contribution path exists.** A user with an idle GPU cannot offer it to the
  site. There is no node registry, no task dispatch to user machines, no reward
  mechanism, no trust/validation layer.
- `epic-platform-integrations` deferred GPU-marketplace provisioning (Vast.ai/RunPod
  instance lifecycle) as Tier 3 out of core scope — that is the _rent_ direction and
  is intentionally separate from this _contribute_ epic.
- **Trust is the hard problem.** Prompts contain private roleplay content; a
  contributor network must never route sensitive data to untrusted nodes, must
  sandbox task execution, and must validate results (malicious/faulty nodes) before
  paying rewards. No existing infrastructure for this.

## Design

```
┌────────────┐   register/heartbeat   ┌──────────────────────────┐
│ Contributor│ ─────────────────────► │  Platform Hub            │
│ Node agent │ ◄───────────────────── │  - node registry         │
│ (GPU/CPU)  │   task / result        │  - dispatcher + queue    │
└────────────┘                        │  - provider integration  │
                                     │  - trust/validation      │
                                     │  - rewards ledger        │
                                     └──────────────────────────┘
                                           │  registerProvider(name,"distributed")
                                           ▼
                              existing generation pipeline
                              (resolveProvider → callWithFailover → circuit breaker)
```

### Pillar 1 — Compute node agent (contributor side)

Small agent users run on their machine (two form factors):

- **Native daemon** (Go/Python/Bun) for GPU inference — registers, advertises
  capabilities (GPU model/VRAM, CPU cores, RAM), heartbeats, pulls tasks, executes
  (vLLM/llama.cpp for LLM; ComfyUI workflow for SD), returns results.
- **Browser/WASM node** for small CPU tasks (embeddings, lightweight classifiers) —
  a WebSocket client so a tab can contribute idle cycles with zero install.

Per-node configuration: capability/model allowlist, data-sensitivity consent class,
auto-pause (idle machine, battery, manual), maximum concurrent tasks. Execution is
sandboxed (dedicated process/container/WASM) with no access to platform secrets.

### Pillar 2 — Node registry + dispatcher (platform hub)

- **Node registry**: registration, heartbeat/health with timeout-based eviction,
  capability index, per-node reputation.
- **Task queue + dispatcher**: dispatch policy (capability match, latency, priority,
  reputation, load balance); reschedule on timeout; **failover to platform default
  providers** when no node is available or a node fails (reuses existing
  `callWithFailover` / circuit-breaker in `src/generation/providers/registry.ts`).
- Scheduler modeled on heterogeneous-pool schedulers (cf. Parallax two-phase
  scheduler, TORTA temporal GPU allocation) but kept deliberately simple for v1:
  capability-filtered FIFO + priority + failover.

### Pillar 3 — Generation pipeline integration

- A `distributed` provider registered via `registerProvider("distributed", …)` that
  maps a `GenerateRequest` to a node task and wraps the node result in the existing
  `GenerateResponse` / `ChunkEvent` contract — the rest of the pipeline is unchanged.
- LLM tasks → node running vLLM/llama.cpp (OpenAI-compatible); SD tasks → node
  running ComfyUI (reuse workflow contract from `src/generation/providers/comfyui.ts`).
- Participates in `resolveProvider` / `buildFailoverList` so it composes with BYOK
  (player key) and platform-default providers; `distributed` is a low-priority
  failover tier or an opt-in primary, config-gated.

### Pillar 4 — Trust, security & validation (critical)

- **Node identity + capability attestation**: hardware fingerprint + capability proof
  (VRAM/GPU model verified, not client-claimed), TLS, per-node secrets.
- **Sandboxing**: tasks run in isolated processes/containers/WASM; no network access
  beyond result channel; no access to platform data.
- **Data-sensitivity scoping** (privacy-first): prompts may contain private roleplay —
  nodes declare a consent class (public-only / non-sensitive / trusted-for-private);
  the platform **never routes sensitive data to untrusted nodes** and defaults to
  non-sensitive task types (image gen, embeddings) on the contributor network unless
  a node is explicitly trusted + user-authorized. This is a hard gate, not a
  preference.
- **Result validation**: redundant execution / checksums / statistical plausibility
  checks to detect faulty or malicious nodes; reputation scoring; rewards paid only
  for validated results.
- **Abuse limits**: rate limiting, no prompt exfiltration (node cannot retain
  prompts), contributor ban/penalty on repeated invalid results.

### Pillar 5 — Rewards & incentives

- **Contribution ledger**: compute-hours, successful validated tasks, model-type
  weight (GPU > CPU; image gen > embeddings).
- **Reward currency** redeemable for: priority generation, platform credits, points
  (link `epic-agency-story-points` / economy), badge/status.
- **Anti-abuse**: rewards accrue only on validated tasks; withheld on
  rejected/invalid results.

### Pillar 6 — Contributor UX + community

- **Node management panel**: register a node (download agent / enable browser node),
  live status, earnings, task history, model allowlist, data-sensitivity consent,
  pause/stop.
- **Community layer** ("and so on"): reward tiers, referral, contributor leaderboard,
  badges — social incentive on top of the utility reward.

## Steps

1. Define contracts: node registration/capability/heartbeat schema, task + result
   message contract, `NodeInfo`/`DispatchTask`/`TaskResult` types, data-sensitivity
   consent classes. (`src/db/migrations/` + Kysely schema for nodes + ledger.)
2. Pillar 1: node agent (native daemon + browser/WASM client); register + advertise +
   heartbeat + task pull/exec/result + pause; sandboxed execution.
3. Pillar 2: node registry + heartbeat eviction + capability index + task queue +
   dispatcher (capability FIFO + priority) + failover to platform providers.
4. Pillar 3: `distributed` provider in `registry.ts`; wire into
   `resolveProvider`/`buildFailoverList`/`callWithFailover`; LLM + ComfyUI task
   contracts; config-gated (default: low-priority failover tier).
5. Pillar 4: attestation, sandboxing, data-sensitivity hard gate, redundant result
   validation, reputation, abuse limits.
6. Pillar 5: contribution ledger + reward computation + redemption.
7. Pillar 6: contributor UI + community layer.
8. Verify: dispatch → node → result → reward round-trip e2e (mocked node);
   validation rejects a malicious node; sensitive data never routed to untrusted
   nodes; failover works when nodes unavailable; `bun run check` + tests green.

## Related Epics

- **`epic-byok-api-keys.md`** — player uses _own key_ for _own requests_ (consumption).
  This epic is the _contribution_ direction: user provides capacity to serve the
  platform. Shared territory: key/credential handling, provider routing, fallback.
- **`epic-byok-local-models.md`** — player runs _own model_ on _own machine_. This epic
  reuses the llama.cpp/ComfyUI node mechanics but for _platform-dispatched_ tasks.
- **`epic-platform-integrations.md`** (EPIC-046) — Tier 3 deferred GPU-marketplace
  _renting_ (Vast.ai/RunPod). Complementary: rent (platform pays) vs contribute
  (platform rewards). Both feed the same provider registry; distinct trust/economics.
- **`epic-api-library-distribution.md`** — outbound API/library distribution; distinct
  direction (distributing APIs out, not accepting compute in). Reference only.
- **`epic-agency-story-points.md` / economy** — reward currency may redeem into points;
  keep redemption optional and decoupled at v1.
- **`epic-testing-qa.md` / `epic-e2e-integration-testing.md`** — the generation
  mocking + browser-scenario pillars apply here (mocked node for dispatch e2e; browser
  test for the contributor panel).

## Tickets

- [ ] `TASK-distributed-compute-node-agent` — contributor node agent (native daemon +
      browser/WASM client): register, capability advertise, heartbeat, task pull/exec/
      result, pause; sandboxed execution.
- [ ] `TASK-distributed-node-registry-dispatcher` — platform hub: node registry +
      heartbeat/health eviction + capability index + task queue + dispatch policy +
      failover to platform providers.
- [ ] `TASK-distributed-generation-integration` — `distributed` provider in
      `registry.ts`; LLM (vLLM/llama.cpp) + ComfyUI task contracts; wire into
      `resolveProvider`/`callWithFailover`; config-gated failover tier.
- [ ] `TASK-distributed-trust-security` — node attestation, sandboxing,
      data-sensitivity hard gate (private content never to untrusted nodes), redundant
      result validation, reputation, abuse limits.
- [ ] `TASK-distributed-rewards-ledger` — contribution ledger + reward computation +
      redemption (credits/priority/points), rewards only on validated tasks.
- [ ] `TASK-distributed-contributor-ui` — node management panel (register, status,
      earnings, task history, model allowlist, consent, pause).
- [ ] `TASK-distributed-incentive-community` — reward tiers, referral, leaderboard,
      badges.
