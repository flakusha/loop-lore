<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Headless Mode & Alternative Frontends Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Headless mode enables non-browser clients (CLI, automation scripts, third-party UIs) to interact with loop-lore via the existing REST + WebSocket surface. Alternative frontends (TUI, mobile, third-party web) plug into the same backend.

## Scope

- **TUI:** `src/tui/` is the canonical blessed-based terminal UI.
- **REST + WebSocket:** `src/server/` + `src/transport/` expose the full API.
- **OpenAPI:** `docs/reference/openapi.json` is the machine-readable contract.
- **Federation:** `src/federation/` enables multi-instance gossip.

## Technical Design

- **TUI:** `bun run tui` starts the TUI against the running server.
- **REST:** all routes documented in `docs/spec/api-routes.md`.
- **WebSocket:** `src/transport/unified.ts` handles connection upgrades.
- **Federation:** `src/federation/gossip.ts` + `src/federation/sharing.ts` enable peer-to-peer.

## Integration Points

- `src/tui/` — TUI app
- `src/server/` — HTTP entry
- `src/transport/` — connection abstractions
- `src/federation/` — multi-instance sync
- `docs/reference/openapi.json` — API contract

## Related Epics

- `.plan/epics/epic-headless-alternative-frontends.md`
- `.plan/epics/epic-terminal-ui.md`
