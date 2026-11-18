<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Unified Cross-Surface Omni-Search

**Status:** shipped — `GET /api/v1/search` (`src/routes/omni-search/`)

One query, fanned out over three surfaces (chats, messages, assets), reusing the
shipped retrieval pieces instead of re-implementing them. The route adds no
search engine of its own: it runs a participant-scoped chat lookup alongside
`searchMessages` and `searchAssets` (`src/search/convenience.ts`), and
inherits each surface's own permission gate.

## Endpoint

`GET /api/v1/search` — registered once, under `/api/v1` only (the plugin surface
registers no unversioned twin). Session-cookie auth: 401 when unauthenticated.

| Query | Type | Limits | Notes |
| --- | --- | --- | --- |
| `q` | string | 1–200 chars, **required** | Trimmed before dispatch; `LIKE` wildcards are escaped |
| `limit` | number | 1–50, default `10` | Per-surface cap (each surface returns up to `limit` hits) |
| `chatId` | string (uuid) | optional | Scopes message hits to one chat (in-chat search) |

Validation is Elysia/TypeBox (`src/routes/omni-search/types.ts`): a missing `q`,
an empty `q`, or a `limit` outside 1–50 answers **422** with the standard
validation body.

Response shape (plus the usual `meta.api_version` envelope):

```json
{
  "query": "tavern",
  "chats": [{ "chatId": "…", "chatName": "…", "characterName": "…", "characterAvatar": null }],
  "messages": [{ "messageId": "…", "chatId": "…", "snippet": "…" }],
  "assets": [{ "assetId": "…", "filename": "…", "matchScore": 0.82 }]
}
```

## Permission inheritance

Each surface keeps its own gate — the route adds no cross-surface authorization
of its own, so querying the union cannot widen a surface.

- **Chats** — an `INNER JOIN chat_participants`: chats the caller participates in
  (the creator is inserted as a participant row at creation, so creator-owned chats
  are covered); archived chats excluded (`is_pinned != 'archived'`). Substring
  match on the chat name or the joined participant actor's display name; `LIKE`
  wildcards in `q` are escaped.
- **Messages** — the message provider's `accessWhere`
  (`src/search/providers/messages.ts`): messages in chats the caller
  participates in or created. A caller holding `admin.chat` sees every message.
- **Assets** — `visibleAssetFilter` via `searchAssets`: public, owned, or
  explicitly shared assets. A caller holding `admin.character` sees all assets.

## Empty query

A whitespace-only `q` trims to the empty string and answers **200** with
`{ "query": "", "chats": [], "messages": [], "assets": [] }` — no surface is
queried (the short-circuit in `src/routes/omni-search/index.ts`).
An absent or zero-length `q` never reaches the handler: the schema rejects it
with 422.

## Per-surface failure degradation

The three surfaces are awaited with `Promise.allSettled`, so a surface that
throws contributes an empty array instead of failing the whole request: the
other two surfaces still answer and the response is still **200** with that
surface's array empty. Each surface reads its own last-committed snapshot —
TOCTOU between surfaces is accepted, and no surface sees another's uncommitted
state.

## Epics

- `.plan/epics/epic-rag-retrieval.md`, `.plan/epics/epic-rag-ui.md` — the
  broader retrieval/UI epics this route is one entry point into.
- `.plan/epics/epic-api-routes.md` — REST API contract.

Ticket: `TASK-1-0-0-gap-unified-cross-surface-omni-search.md`.
