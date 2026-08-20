<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Matrix — Pre-Compiled Hot Binary Modules

**Created:** 2026-08-20
**Purpose:** Integration points for pre-compiled hot binary modules. Extracted from `matrix-cross-mechanics.md`, which had absorbed this distinct domain's integration section.

Companion epic: `epic-precompiled-hot-binaries.md`. Ticket: `TASK-precompiled-hot-binaries.md`.

## Integration Points

### Systems This Epic Depends On

| System                        | What It Provides                               | How Used                    |
| ----------------------------- | ---------------------------------------------- | --------------------------- |
| Testing & Benchmarking        | Performance benchmarks for native modules      | Measure native vs JS speed  |
| Multi-Instance Reconciliation | Native module initialization in multi-instance | Binary loading per instance |

### Systems That Depend On This Epic

| System                           | What It Consumes          | How Used                         |
| -------------------------------- | ------------------------- | -------------------------------- |
| Headless & Alternative Frontends | SDK distribution strategy | Native modules in SDK packages   |
| Testing & Benchmarking           | Native module benchmarks  | Performance regression detection |

### Shared Data Contracts

| Contract       | Shared With    | Purpose                                   |
| -------------- | -------------- | ----------------------------------------- |
| ModuleManifest | Security audit | Binary verification + capability checking |

### Cross-System Events

| Event           | Direction | Purpose                                 |
| --------------- | --------- | --------------------------------------- |
| binary.loaded   | emits     | Notify system when native module loaded |
| binary.fallback | emits     | Notify system when falling back to JS   |

