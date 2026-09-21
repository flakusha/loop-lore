<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Fuzzing Input Generation Strategy

Status: Not implemented — strategy document only. No fuzz harness, corpus, or CI targets exist in the repo.

## Implemented

- Nothing yet; everything below is design target.

## Not implemented / aspirational (design content, compressed)

- Budgets: P0 auth (40%) + asset upload (25%); P1 chat/LLM prompt (15% + 10%); P2 admin/config + internal IPC (5% each).
- Categories: structured data (schema-aware mutation, schema violations), text/protocol (grammar-based, injection payloads, encoding attacks), binary/asset (format corruption, polyglots, ZIP/decompression bombs), network/transport (protocol + state-machine abuse), crypto inputs (invalid curves, weak keys, nonce reuse, padding oracles).
- Mutation strategies: bitflip, arithmetic, dictionary, structure-aware, crossover, generative.
- Pipeline: schema/grammar → base corpus (anonymized traffic, OpenAPI specs, unit-test seeds) → mutation engine → validation/filter; corpus minimization via `afl-cmin`, < 10k seeds per target.
- Harness contract: setup/fuzz/teardown; result ∈ crash|timeout|oom|assertion|ok|invalid plus coverage and minimal repro; 1s per-iteration budget, 512MB memory cap.
- Sanitizers: ASan+UBSan default combo, MSan for uninitialized memory, TSan for threaded targets.
- Crash triage: dedupe by stack hash → minimize (`afl-tmin`) → CVSS classify (EXPLOITABLE ≥ 7.0 / HIGH 4.0–6.9 / MEDIUM 0.1–3.9 / LOW informational) → regression corpus + security changelog.
- Per-run metrics: > 1000 exec/s, > 80% edge coverage, zero unique crashes, > 5%/hr corpus growth, flat memory.

## Epics

- `.plan/epics/epic-fuzzing-infrastructure.md` — owner (Not Started): input-category table, harness framework types, task list; targets live in `tests/fuzz/`.
- Parent hub: `.plan/epics/epic-testing-benchmarking.md`; fuzzing dashboard panels render via `.plan/epics/epic-performance-dashboard-slo.md`.
