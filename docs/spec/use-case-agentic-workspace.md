# Additional Use Case: Agentic Assistant Workspace

## Overview

While the default use case for loop-lore is **RPG roleplay chat** (User × Character, User × User, User × Assistant), the architecture is designed to support a secondary mode: **Agentic Assistant Workspace**.

In this mode, the core entities are repurposed:

- **Worlds → Epics** (large bodies of work, projects, research initiatives)
- **Locations → Tasks** (discrete units of work within an Epic)
- **Characters → Agents** (specialized AI agents with defined capabilities, tools, and personas)
- **Chats → Workspaces** (contextual work areas where agents collaborate with users to solve problems)

This document outlines how the existing architecture maps to this use case and what minimal additions would enable it.

---

## Entity Mapping

| RPG Concept   | Agentic Workspace Concept | Description                                                                                                                    |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **World**     | **Epic**                  | A top-level project or research initiative. Contains lore → becomes "project context, goals, constraints, background research" |
| **Location**  | **Task**                  | A discrete unit of work within an Epic. Connections between locations → become task dependencies / workflow edges              |
| **Character** | **Agent**                 | An AI agent with a specific role (researcher, coder, analyst, writer, etc.). `agent_type` enum already supports this           |
| **Chat**      | **Workspace**             | A 1:1 conversation between User and Agent (or User + multiple Agents via future group chat) focused on a specific Task         |
| **Message**   | **Message**               | Unchanged — but `content_type` gains `tool_call`, `tool_result`, `code_execution`, `artifact`                                  |
| **Asset**     | **Artifact**              | Code files, research documents, generated reports, charts, datasets — linked polymorphically to Tasks/Epics                    |

---

## Schema Compatibility

The existing schema already supports this mapping with minimal changes:

### `worlds` table → `epics` (conceptual rename, same table)

- `lore` → `context` (project background, requirements, constraints)
- `description` → `objective` (what this epic aims to achieve)
- `asset_links` with `entity_type='world'` → link research docs, reference materials, datasets

### `locations` (future table, sub-entity of worlds) → `tasks`

- `name` → task title
- `description` → task specification / acceptance criteria
- `connections` → task dependencies (DAG)
- `chat_id` reference → active workspace for this task

### `actors` table → `agents`

- `actor_type='character'` with `agent_type='ai'` → already models AI agents
- `system_prompt` → agent instructions / persona / tool definitions
- `settings` (JSON) → model config, temperature, tool permissions, MCP servers
- `agent_type` enum: `'none' | 'ai' | 'narrator' | 'npc'` → extend to `'researcher' | 'coder' | 'analyst' | 'writer' | 'planner'`

### `chats` table → `workspaces`

- `type='direct'` → User × Agent workspace
- `world_id` (future FK) → Epic this workspace belongs to
- `location_id` (future FK) → Task this workspace is working on

### `messages` table

- `role` enum: add `'tool'` for tool calls/results
- `content_type` enum: add `'tool_call'`, `'tool_result'`, `'code'`, `'artifact'`
- `model_id`, `provider`, token fields → already track LLM usage per agent turn

### `assets` table → `artifacts`

- `asset_type`: add `'code'`, `'document'`, `'data'`, `'notebook'`
- `label` in `asset_links`: `'deliverable'`, `'reference'`, `'intermediate'`, `'log'`

---

## Agent Capabilities Framework

The existing **Enhanced Assistant** (`src/assistant/`) is the foundation. It currently provides rule-based responses. For agentic workspace, it evolves into an **Agent Runtime**:

### Core Agent Interface

```typescript
interface Agent {
  id: string; // actor.id
  name: string; // actor.display_name
  role: AgentRole; // researcher | coder | analyst | writer | planner | custom
  systemPrompt: string; // actor.system_prompt
  tools: ToolDefinition[]; // actor.settings.tools
  modelConfig: ModelConfig; // actor.settings.model
  memory: AgentMemory; // long-term context, facts, preferences
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: (params: any) => Promise<ToolResult>;
}
```

### Built-in Tool Categories

| Category            | Tools                                              | Example                                |
| ------------------- | -------------------------------------------------- | -------------------------------------- |
| **Web Research**    | `search`, `extract`, `deep_research`               | Multi-step web research with citations |
| **Code Execution**  | `run_code`, `run_shell`, `read_file`, `write_file` | Python/JS/TS execution, file ops       |
| **Data Analysis**   | `query_sql`, `analyze_csv`, `plot`                 | Pandas, DuckDB, visualization          |
| **Document Ops**    | `create_doc`, `edit_doc`, `convert_format`         | Markdown, HTML, PDF, Notebook          |
| **API/Integration** | `http_request`, `mcp_call`                         | REST, GraphQL, MCP servers             |

### Agent Memory

- **Episodic**: Conversation history within a Workspace (already in `messages`)
- **Semantic**: Extracted facts, decisions, insights → stored as `assets` linked to Epic/Task with `label='memory'`
- **Procedural**: Learned patterns, successful strategies → stored in `actor.settings.memory`

---

## Plugin System

The agentic workspace use case requires a **plugin system** for extensibility. This aligns with the roadmap item "Plugin System: Server-side extensions for custom functionality."

### Plugin Architecture

```typescript
// Core plugin interface
interface Plugin {
  name: string;
  version: string;
  description: string;
  author: string;

  // Lifecycle
  onLoad?(context: PluginContext): Promise<void>;
  onUnload?(): Promise<void>;

  // Extensions
  tools?: ToolDefinition[]; // New tools for agents
  agentRoles?: AgentRoleDefinition[]; // New agent role templates
  uiComponents?: UIComponent[]; // WebUI/TUI components
  apiRoutes?: RouteDefinition[]; // Custom REST endpoints
  eventHandlers?: EventHandler[]; // React to system events
}

interface PluginContext {
  db: Database; // Kysely instance
  config: Config; // Full config
  eventBus: EventBus; // For loose coupling
  registerTool: (tool: ToolDefinition) => void;
  registerAgentRole: (role: AgentRoleDefinition) => void;
}
```

### Plugin Types

| Type              | Description                                     | Example                                                                |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| **Native (Core)** | Bundled with loop-lore, maintained by core team | `dice-roller`, `code-executor`, `web-research`, `file-ops`             |
| **Community**     | Third-party, installed via plugin registry      | `dnd-5e-tools`, `jira-integration`, `github-actions`, `latex-renderer` |
| **Local**         | User-created, dropped in `plugins/` directory   | Custom workflow automation, domain-specific tools                      |

### Plugin Discovery & Loading

Plugins are organized into three directories:

- **`plugins/core/`** — Built-in, read-only: `dice-roller`, `code-executor`, `web-research`
- **`plugins/community/`** — Installed from registry: `dnd-5e-tools`, `github-integration`
- **`plugins/local/`** — User's own custom plugins: `my-custom-plugin`

### Example: DnD Dice Roller Plugin

```typescript
// plugins/core/dice-roller/index.ts
export const plugin: Plugin = {
  name: "dice-roller",
  version: "1.0.0",
  description: "D&D 5e dice rolling with advantage/disadvantage, modifiers, and roll history",

  tools: [
    {
      name: "roll_dice",
      description: 'Roll D&D dice (e.g., "2d6+3", "1d20adv", "4d6kh3")',
      parameters: {
        type: "object",
        properties: {
          notation: { type: "string", description: "Dice notation" },
          reason: { type: "string", description: "Why this roll?" },
        },
        required: ["notation"],
      },
      handler: async ({ notation, reason }) => {
        const result = DiceParser.roll(notation);
        return {
          content: `🎲 ${notation} = ${result.total} (${result.breakdown})${reason ? ` — ${reason}` : ""}`,
          metadata: { type: "dice_roll", notation, ...result },
        };
      },
    },
  ],

  agentRoles: [
    {
      id: "dnd-gm",
      name: "D&D Game Master",
      description: "Runs D&D 5e sessions with rules knowledge",
      systemPrompt: "You are a D&D 5e GM. Use roll_dice for all checks...",
      tools: ["roll_dice", "lookup_rule", "manage_combat"],
    },
  ],
};
```

### Plugin API (REST)

```
GET    /api/plugins              # List installed plugins
POST   /api/plugins/install      # Install from registry (community)
DELETE /api/plugins/:name        # Uninstall
POST   /api/plugins/:name/enable # Enable plugin
POST   /api/plugins/:name/disable # Disable plugin
GET    /api/plugins/:name/manifest # Get plugin metadata
```

---

## User Experience: RPG vs Agentic Workspace

### Mode Switching

The application detects the active mode via a **workspace type** on the chat:

- `chat.mode = 'rpg'` → Standard RPG UI (character portraits, world lore panel, immersion-focused)
- `chat.mode = 'agentic'` → Workspace UI (task panel, agent selector, tool output, artifact gallery)

### Agentic Workspace Layout (WebUI)

A three-panel workspace layout:

- **Left panel (AGENTS):** Agent list (Research, Coder, Analyst, Writer) with Add Agent button
- **Center panel (WORKSPACE/Chat):** Conversation area showing user messages, agent responses, and tool call results (web_search → results)
- **Right panel (ARTIFACTS):** Generated artifacts gallery (paper1, paper2, chart, notes) with Upload button
- **Bottom bar (TASK GRAPH):** Visual task progression — Literature Review → Synthesis → Report Writing

### TUI Adaptation

- Agent list in left panel (replaces character list)
- Task graph visualization using `blessed-contrib` (tree/flow)
- Tool output rendered as structured logs (collapsible)
- Artifact gallery shows code files, markdown, images

---

## Implementation Checklist

### Schema & Types

- [ ] Add `mode` column to `chats` table (`'rpg' | 'agentic'`)
- [ ] Extend `actors.agent_type` enum with agent roles
- [ ] Extend `messages.content_type` enum with tool/artifact types
- [ ] Add `locations` table (sub-entity of worlds) for tasks
- [ ] Add `task_dependencies` table (DAG edges)

### Agent Runtime

- [ ] Refactor `src/assistant/service.ts` → `src/agent/runtime.ts`
- [ ] Implement `ToolDefinition` registry and execution sandbox
- [ ] Built-in tools: `web_search`, `run_code`, `file_ops`, `http_request`
- [ ] Agent memory system (semantic + procedural)

### Plugin System

- [ ] Plugin loader (core/community/local directories)
- [ ] Plugin manifest schema + validation
- [ ] Plugin registry API (install/enable/disable)
- [ ] Example plugins: `dice-roller`, `code-executor`, `web-research`

### UI Adaptation

- [ ] Workspace mode detection in routing
- [ ] Agentic layout (agents panel, task graph, artifact gallery)
- [ ] Tool output rendering (streaming, collapsible, structured)
- [ ] TUI agent/task views

### Polish & Examples

- [ ] Deep Research agent (multi-step web research → report)
- [ ] Code Agent (write/test/debug code in sandbox)
- [ ] Data Analysis Agent (SQL + visualization)
- [ ] Documentation & migration guide

## Configuration

```yaml
# config.yaml additions
agentic:
  enabled: true
  defaultMode: rpg # or 'agentic'
  maxConcurrentAgents: 3
  toolTimeoutMs: 120000
  sandboxEnabled: true # Isolate code execution

plugins:
  enabled: true
  directories:
    - "plugins/core"
    - "plugins/community"
    - "plugins/local"
  registryUrl: "https://plugins.loop-lore.dev"
  autoUpdate: false

agents:
  defaultModel: "claude-3.5-sonnet"
  temperature: 0.7
  maxTokens: 8192
```

---

## Security Considerations

1. **Tool Sandboxing**: Code execution runs in isolated containers (Firecracker/gVisor) or WASM
2. **Plugin Signing**: Community plugins require signature verification
3. **Permission Model**: Agents request tool permissions; user approves per workspace
4. **Network Egress**: Tool network calls go through configurable proxy/allowlist
5. **Resource Limits**: CPU/memory/time quotas per agent execution

---

## Relationship to Existing Features

| Feature       | RPG Use          | Agentic Use            | Shared                 |
| ------------- | ---------------- | ---------------------- | ---------------------- |
| Worlds        | Story setting    | Project context        | ✅ Same table          |
| Locations     | Scene/place      | Task/unit of work      | ✅ Same table (new)    |
| Characters    | NPCs/PCs         | AI Agents              | ✅ Same `actors` table |
| Chats         | Roleplay session | Workspace              | ✅ Same table + `mode` |
| Messages      | Dialogue         | Dialogue + tool calls  | ✅ Extended enums      |
| Assets        | Images/audio     | Artifacts (code, docs) | ✅ Polymorphic links   |
| Assistant     | GM helper        | Agent runtime          | ✅ Evolved service     |
| Plugin System | Dice, mechanics  | Tools, integrations    | ✅ Same framework      |

---

## Conclusion

The agentic assistant workspace is not a separate product — it is a **mode** of the same application, leveraging the same database schema, service layer, and UI components. The RPG and agentic use cases share most of the codebase. The plugin system serves both: D&D dice rollers for RPG, code executors for agentic work.

This dual-use design ensures loop-lore remains lightweight while serving both creative storytelling and practical AI-assisted work.
