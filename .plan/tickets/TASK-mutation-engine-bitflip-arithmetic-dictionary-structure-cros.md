<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Mutation engine — bitflip, arithmetic, dictionary, structure, crossover, generative

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Implement the six mutation strategies from the epic design: (1) Bitflip — deterministic 1-4 bit flips at byte offsets; (2) Arithmetic — add/subtract to 8/16/32-bit integers targeting length fields; (3) Dictionary — known-bad strings from CVE databases and project bug reports; (4) Structure-aware — JSON key insertion/deletion, Protobuf field tag corruption; (5) Cross-over — splice fragments from 2+ valid inputs at structure boundaries; (6) Generative — random valid generation from schema with targeted constraint violations. Integrates with `FuzzMutator` interface. Builds on `scripts/generate-schema-fuzz.ts` (validity-only); mutation targets the reject path that schema-fuzz does not exercise.

**Context:**

The mutation engine is the core fuzzing logic that transforms seed inputs into novel test cases. `scripts/generate-schema-fuzz.ts` already handles validity-only generation — it produces well-formed schema-valid inputs, which is the complement the mutation engine lacks. Six strategies are required: bitflip, arithmetic, dictionary, structure-aware, crossover, and generative. Each addresses a distinct failure class: bitflip catches byte-level parser bugs, arithmetic catches length-field mismatches, dictionary targets known CVE patterns, structure-aware targets JSON/Protobuf schema violations, crossover creates novel input combinations, and generative produces constraint-violating valid-type inputs.

Constraint: the engine must integrate with the `FuzzMutator` interface from the epic design block and feed into the runner's per-iteration budget (1s) and memory cap (512MB). Strategies that are expensive to compute relative to their mutation diversity (e.g., brute-force crossover over large inputs) must be rate-limited or gated on input size.

Alternative: implement only the simpler strategies (bitflip, dictionary) and skip structure-aware / generative. Accepted as a v1 slice if iteration budget is tight, but structure-aware mutations are the highest-value additions for structured wire-protocol targets (auth, asset) and should not be indefinitely deferred.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
