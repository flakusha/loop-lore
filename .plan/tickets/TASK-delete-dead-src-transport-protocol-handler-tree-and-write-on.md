<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete dead src/transport/ protocol-handler tree and write-only config.transport keys

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Delete the unwired HTTP/1.1 / H2 / WS / upgrade protocol-handler half of src/transport/ plus the write-only config.transport section. Research: .tmp/simplification/platform.md finding 'delete: the entire protocol-handler half of src/transport/'. Re-derive the list with 'bun run dead:code:src'.

**Context:**

`Bun.serve` already owns HTTP/1.1, H2, WebSocket and TLS. `src/server/start.ts:4` imports `serve`
from `bun` and never touches this tree. Nothing outside `src/transport/` imports any of it.
Source: `.tmp/simplification/platform.md`.

**Scope — files to delete:**

- `src/transport/base.ts:1-122`
- `src/transport/factory.ts:1-124`
- `src/transport/h2.ts:1-74`
- `src/transport/http1.ts:1-63`
- `src/transport/ws.ts:1-158`
- `src/transport/upgrade.ts:1-114`
- `src/transport/negotiation.ts:1-104`
- `src/transport/protocol.unified.ts:1-53`
- `src/transport/compression.ts:1-175`
- `src/transport/errors.ts:1-37`
- `src/transport/index.ts:1-37`
- `src/transport/test/harness.ts:1-179`
- the `*.test.ts` files that exist only to test the above
- `src/config/sections/transport.ts:1-104` and the write-only keys `enableH2`, `enableH3`,
  `enableWebSocket`, `enableWebTransport`, `defaultProtocol`;
  `src/config/schema-class/env-map.ts:133-137`; `configs/config.transport.toml:4-9`

**MUST RETAIN — correction carried over from the routes audit.** `.tmp/simplification/routes.md`
proved two files in this directory are live, so this ticket must NOT sweep the whole directory:

- `src/transport/negotiation-parsers.ts` — imported at `src/middleware/dynamic-response.ts:36`
  and called at `src/middleware/dynamic-response.ts:216`
  (`parseAcceptEncoding(accept).filter((algo) => algo !== CompressionAlgorithm.None)`).
- `src/transport/peer-table.ts` — imported at `src/federation/gossip.ts:20`.

The platform audit's "delete all of `src/transport/`" claim is **wrong for these two files**. This
is a correction, not a conflict: the routes audit proved reachability from a production entrypoint
and it wins. Evidence (executed by the routes audit):
`grep -rnIE 'from "[^"]*transport/' src/ tests/ scripts/ --include='*.ts' | grep -v '^src/transport/'`
returns exactly two rows — `src/middleware/dynamic-response.ts:36` and
`src/federation/gossip.ts:20`.

**Evidence:**

- Per-symbol grep for `createProtocol`, `TransportBase`, `H2Handler`, `Http1Handler`, `WsHandler`,
  `withCompression`, `upgradeConnection`, `DEFAULT_CAPABILITIES`, `buildDefaultTests`,
  `validateProtocol`, `TransportError`, excluding `src/transport/` and `*.test.ts` → 0 hits each.
- `grep -rn "transport/(base|factory|h2|http1|ws|upgrade|compression|errors|negotiation|index)"
  src tests scripts plugins` → only self-references and `docs/` prose.
- Config keys: `grep -rn "enableH2|enableH3|enableWebSocket|enableWebTransport|defaultProtocol"
  src tests scripts configs package.json` → hits only in `src/config/sections/transport.ts`,
  `src/config/schema-class/env-map.ts` and the TOML/YAML config files themselves; zero reads in
  application code. `grep -rnIF 'config.transport|\.transport\.' src/routes src/middleware src/validation
  --include='*.ts'` → no non-test hits.

**Caveats / constraints:**

- Open tickets `TASK-transport-layer-expansion`, `TASK-TRANSPORT-SERVER-WIRING`,
  `EPIC-TRANSPORT-LAYER-EXPANSION`, `TASK-TRANSPORT-EXPANSION` and
  `TASK-hold-inbound-http-3-until-bun-supports-websocket-over-h3` describe *expanding* this layer.
  Deleting it is a product decision, not mechanical cleanup: either close/redirect those tickets
  first, or keep `negotiation-parsers.ts` + `peer-table.ts` as the surviving kernel and delete only
  the handlers. Do not silently strand those epics.
- Do NOT touch `src/routes/worlds/fractal-travel-routes.ts`, `travel-status.ts` or
  `src/validation/schemas/travel-wire.ts` — those "transport" hits are the RPG travel feature.
- Closed BUGs against this tree (`BUG-http1handler-send-is-a-silent-no-op`,
  `BUG-wshandler-send-queues-messages-while-disconnected`) lose their subject with the delete; note
  that in the PR.
- If the owner prefers wiring `Bun.serve({ http3, tls })` over deleting `config.transport`, that is a
  separate ticket — do not grow scope here.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
