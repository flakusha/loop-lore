# Additional Use Case: Agentic Assistant Workspace

Secondary mode beyond RPG roleplay chat. Core entities repurposed.

## Entity Mapping

| RPG Concept   | Agentic Workspace | Description                                             |
| ------------- | ----------------- | ------------------------------------------------------- |
| **World**     | **Epic**          | Project/research initiative. Lore→project context       |
| **Location**  | **Task**          | Discrete work unit. Connections→task dependencies (DAG) |
| **Character** | **Agent**         | AI agent with role (researcher, coder, analyst, writer) |
| **Chat**      | **Workspace**     | 1:1 User↔Agent or multi-agent conversation per Task     |
| **Message**   | **Message**       | + `content_type`: `tool_call`, `tool_result`, `code`    |
| **Asset**     | **Artifact**      | Code, docs, reports, charts linked polymorphically      |

## Schema Compatibility

Existing schema supports this with minimal changes:

- `worlds` table → epics (conceptual rename). `lore`→context, `description`→objective.
- `locations` (future table) → tasks with DAG dependencies.
- `actors` with `actor_type='character'` and `agent_type='ai'` → agents. `system_prompt`→instructions. `settings`→model config, tools, MCP servers.
- `chats` → workspaces. Add `type` field for mode.
- `messages.role` → add `'tool'`. `content_type` → add `'tool_call'`, `'tool_result'`, `'code'`, `'artifact'`.
- `assets` → artifacts. `asset_type`→`'code'`, `'document'`, `'data'`, `'notebook'`.

## Agent Capabilities

Foundation: `src/assistant/` (rule-based). Evolved to Agent Runtime:

### Built-in Tool Categories

| Category        | Tools                                              |
| --------------- | -------------------------------------------------- |
| Web Research    | `search`, `extract`, `deep_research`               |
| Code Execution  | `run_code`, `run_shell`, `read_file`, `write_file` |
| Data Analysis   | `query_sql`, `analyze_csv`, `plot`                 |
| Document Ops    | `create_doc`, `edit_doc`, `convert_format`         |
| API/Integration | `http_request`, `mcp_call`                         |

### Agent Memory

- Episodic: conversation history (messages table)
- Semantic: extracted facts as `assets` with `label='memory'`
- Procedural: patterns in `actor.settings.memory`

## Plugin System

See `docs/spec/plugin-system.md`. Plugin types: `plugins/core/`, `plugins/community/`, `plugins/local/`.

## UI Adaptation

- `chat.mode = 'rpg'` → standard RPG UI
- `chat.mode = 'agentic'` → workspace UI with agents panel, task graph, artifact gallery

WebUI layout: LEFT agents list, CENTER workspace/chat, RIGHT artifacts gallery, BOTTOM task graph.

TUI: agent list replaces character list, task graph via `blessed-contrib`, tool output as structured logs.

## Implementation Checklist

### Schema & Types

- Add `mode` column to `chats` (`'rpg' | 'agentic'`)
- Extend `actors.agent_type` enum
- Extend `messages.content_type` enum
- Add `locations` table for tasks
- Add `task_dependencies` table

### Agent Runtime

- Refactor `src/assistant/service.ts` → `src/agent/runtime.ts`
- Tool registry and execution sandbox
- Built-in tools: search, code, file ops, HTTP

### Plugin System

- Plugin loader (core/community/local)
- Registry API (install/enable/disable)
- Example plugins

### UI Adaptation

- Workspace mode detection
- Agentic layout (agents, task graph, artifact gallery)
- TUI agent/task views

## Config

```yaml
agentic:
  enabled: true; defaultMode: rpg
  maxConcurrentAgents: 3; toolTimeoutMs: 120000
plugins:
  enabled: true; directories: [plugins/core, plugins/community, plugins/local]
agents:
  defaultModel: "claude-3.5-sonnet"; temperature: 0.7; maxTokens: 8192
```

## Security

- Tool sandboxing (isolated containers/WASM)
- Plugin signing for community plugins
- Permission model per workspace
- Network egress via configurable proxy/allowlist
- Resource limits per agent execution

## Conclusion

The agentic workspace is a mode of the same application, not a separate product. Same schema, service layer, and UI. Plugin system serves both RPG and agentic use cases.
