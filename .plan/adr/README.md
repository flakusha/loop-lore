<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Architecture Decision Records

ADRs are the durable record for operator decisions that change the shape of the product. They live here, not in ticket prose or research notes.

## Naming

`ADR-<short-slug>.md`, one decision per file. Example: `ADR-api-version-v1.md`.

## Required front matter (plain bold fields, no YAML)

- SPDX license + copyright comment lines.
- `# ADR: <title>`.
- `**Status:**` — one of `PROPOSED`, `ACCEPTED`, `SUPERSEDED`, `PARTIALLY IMPLEMENTED` (append a one-line qualifier when needed).
- `**Date:**` ISO date of the decision.
- `**Decides:**` the question or ticket(s) resolved.
- `**Ticket:**` the owning ticket (if any).
- `**Related:**` tickets, epics, or source files.

## Required sections

`## Context`, `## Decision`, `## Consequences`, `## Rejected alternatives`. Add `## Compliance` (where the decision is encoded in code) and `## Open questions` when applicable.

## Lifecycle

- An accepted ADR is not edited in place. A change that reverses it gets a new ADR that marks the old one `SUPERSEDED` and links both ways.
- Link the ADR from the tracker entry that records the decision; the ticket references the ADR by filename.
- Keep ADRs qualitative. Do not paste commit counts, gate tallies, or other numbers that go stale.
