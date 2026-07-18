# Business & Assistant Scenarios — Ordinary Use Cases

Concrete, non-RPG ways the platform is used once `chat.mode='agentic'` ships.
Each maps to existing modules so estimates stay realistic.

## Scenario A — Knowledge Assistant (Enterprise RAG)

**User:** employee asks questions over company docs/Slack/CRM.
**Flow:** ingest docs → `assets` → embed → retrieve → agent answers with
citations → `#10` grounding guard flags unsupported claims.
**Reuse:** `assets/`, `generation/`, `actors/` (one "KB agent"), `crypto/` (private
data at rest), `users-sessions/` (role-scoped access).
**Build:** embedding+retrieval adapter, audit sink.
**Latest ideas that help:** #10 (grounding), #12/#13 (memory + graph), #25 (E2E
sync for field use), #26 (multimodal doc input).

## Scenario B — Research / Analyst Agent

**User:** "Summarize the Q3 market and draft a memo."
**Flow:** `search`+`extract` tools → synthesize → `create_doc` artifact →
`plot` charts → user reviews with `#8` smart-regen ("make it formal").
**Reuse:** agent runtime, `assets` (reports/data), `generation/` streaming,
`assistant/` improvement commands.
**Build:** web-research + plotting tools in registry.
**Latest ideas:** #8 (smart-regen), #15 (procedural assets for charts), #29
(export dataset).

## Scenario C — Ops / IT Copilot (process automation)

**User:** "Query the orders DB and open a Jira ticket if any are stuck."
**Flow:** `query_sql` + `http_request` (Jira MCP) tools → agent executes →
`create_doc` runbook artifact.
**Reuse:** tool registry, `actors` (ops agent), `logger/` (audit), `crypto/`.
**Build:** SQL + HTTP/MCP tools, egress allowlist.
**Latest ideas:** plugin system (integration marketplace), #6 (regex to parse
API responses into structured output).

## Scenario D — Content / Authoring Studio

**User:** marketing team drafts, translates, and publishes copy.
**Flow:** `#8` smart-regen → `#7` auto-translation (multilingual) →
`creative-studio` (rich authoring) → `export`/publish.
**Reuse:** `assistant-commands.md` (`/improve`), `frontend/chat/export.md`,
`creative-studio.md`, `internationalization.md`.
**Build:** minimal — mostly wiring existing ideas.
**Latest ideas:** #7, #8, #15, #18 (template share), #9 (prompt marketplace).

## Scenario E — Team Collaboration Workspace

**User:** a pod works a project together with shared agents + artifacts.
**Flow:** `users-sessions/` multi-user → shared workspace (`worlds`→epic) →
`#19` co-authoring presence (WS transport) → `#20` shared persistent workspace
(CRDT).
**Reuse:** multi-user sessions, WS transport, `assets` polymorphic linking.
**Build:** CRDT sync layer, presence.
**Latest ideas:** #19, #20, #25 (cross-device sync), #21 (publish/moderate).

## Scenario F — Personal Assistant (solo / prosumer)

**User:** individual organizes life/works with a private agent.
**Flow:** demo/solo mode (`users-sessions.md`) → personal agent with `#12`
cross-chat memory → `#25` sync across phone/desktop → `#26` voice/image input.
**Reuse:** solo mode, `actors`, `assets`, `crypto/` BYOK.
**Build:** mobile-native UX (#24), on-device inference (#23) for offline.
**Latest ideas:** #23, #24, #25, #26, #12.

## Cross-cutting business requirements

| Requirement | Where satisfied | Gap |
| ----------- | -------------- | --- |
| Access control | `auth-middleware`, roles | SSO/SAML, tenant isolation |
| Confidentiality | `crypto/` AES-256-GCM | — (strong) |
| Cost governance | token tracking + #27 | per-user/agent budgets |
| Audit | `logger/` | dedicated audit store |
| Compliance export | `export.md` | retention policies |
| Uptime/scale | PG dialect swap | horizontal agent workers |

*Reintegrate as: new `docs/spec/use-case-{knowledge,research,ops,authoring,team,personal}.md`
or a single `docs/spec/use-cases-business.md`.*
