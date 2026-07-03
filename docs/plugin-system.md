# Plugin System Specification

## Overview

The loop-lore plugin system enables extensibility for both RPG and Agentic Workspace modes through a standardized interface for adding custom functionality. Plugins can extend the system with new tools, agent roles, API routes, UI components, and more while maintaining a clean separation from core code.

## Core Concepts

### Plugin Types

1. **Core Plugins** - Bundled with loop-lore, maintained by the core team
   - Examples: dice-roller, code-executor, web-research, file-ops
   - Located in `plugins/core/` directory (read-only)

2. **Community Plugins** - Third-party plugins installed from the plugin registry
   - Examples: dnd-5e-tools, jira-integration, github-actions, latex-renderer
   - Located in `plugins/community/` directory
   - Require signature verification for security

3. **Local Plugins** - User-created plugins for custom workflow automation
   - Located in `plugins/local/` directory
   - No signature verification required (user assumes risk)

### Extension Points

Plugins can extend loop-lore through these well-defined interfaces:

- **Tools** - Functions AI agents can execute (web search, code execution, etc.)
- **Agent Roles** - Pre-configured agent templates with specific capabilities
- **API Routes** - Custom REST endpoints for plugin functionality
- **UI Components** - WebUI/TUI components that integrate with the interface
- **Event Handlers** - React to system events for loose coupling
- **Database Extensions** - Custom tables or fields (via migrations)

## Plugin Manifest

Each plugin must include a `plugin.ts` (or `plugin.js`) file exporting a `Plugin` interface:

```typescript
interface Plugin {
  name: string; // Unique plugin identifier (kebab-case)
  version: string; // Semantic version (MAJOR.MINOR.PATCH)
  description: string; // Human-readable description
  author: string; // Plugin author
  homepage?: string; // Optional URL to plugin documentation
  license?: string; // Optional license identifier

  // Lifecycle hooks
  onLoad?(context: PluginContext): Promise<void>;
  onUnload?(): Promise<void>;

  // Extensions
  tools?: ToolDefinition[]; // New tools available to agents
  agentRoles?: AgentRoleDefinition[]; // New agent role templates
  apiRoutes?: RouteDefinition[]; // Custom REST API endpoints
  uiComponents?: UIComponent[]; // WebUI/TUI components
  eventHandlers?: EventHandler[]; // System event subscriptions
  migrations?: Migration[]; // Database schema changes
  configSchema?: ConfigSchema; // Plugin configuration validation
}
```

### Plugin Context

During initialization, plugins receive a context object with access to core systems:

```typescript
interface PluginContext {
  db: Database; // Kysely instance for database operations
  config: Config; // Full application configuration
  eventBus: EventBus; // For publishing/subscribing to events
  logger: Logger; // Structured logging interface

  // Registration helpers
  registerTool: (tool: ToolDefinition) => void;
  registerAgentRole: (role: AgentRoleDefinition) => void;
  registerApiRoute: (route: RouteDefinition) => void;
  registerUiComponent: (component: UIComponent) => void;
}
```

## Tool Definition

Tools are functions that AI agents can execute. They define a typed interface for parameter validation and execution:

```typescript
interface ToolDefinition {
  name: string; // Unique tool name within plugin
  description: string; // What the tool does (for AI reasoning)
  parameters: JSONSchema; // Input validation schema (JSON Schema)
  handler: (params: any) => Promise<ToolResult>; // Async execution function

  // Optional metadata
  permissions?: string[]; // Required permissions to use this tool
  timeoutMs?: number; // Execution timeout (default: 30000)
  sandboxed?: boolean; // Whether to run in isolated sandbox
}

interface ToolResult {
  content: string; // Human-readable result (shown to user)
  metadata?: Record<string, any>; // Structured data for programmatic use
  isError?: boolean; // Whether this represents an error
}
```

### Built-in Tool Categories

Loop-lore provides these standard tool categories that plugins can extend:

1. **Web Research** - `search`, `extract`, `deep_research`
2. **Code Execution** - `run_code`, `run_shell`, `read_file`, `write_file`
3. **Data Analysis** - `query_sql`, `analyze_csv`, `plot`
4. **Document Operations** - `create_doc`, `edit_doc`, `convert_format`
5. **API/Integration** - `http_request`, `mcp_call`
6. **File Operations** - `read_file`, `write_file`, `list_dir`, `delete_file`

## Agent Role Definition

Agent roles define pre-configured AI agents with specific capabilities:

```typescript
interface AgentRoleDefinition {
  id: string; // Unique role identifier
  name: string; // Human-readable role name
  description: string; // What this agent role does
  systemPrompt: string; // Base instructions for the agent
  tools: string[]; // List of tool names this agent can use
  modelConfig?: ModelConfig; // Default model configuration
  memoryConfig?: MemoryConfig; // Memory system configuration
  permissions?: string[]; // Default permissions granted
}
```

## API Route Definition

Plugins can add custom REST endpoints:

```typescript
interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string; // URL path (will be prefixed with /api/plugins/:name)
  handler: (req: Request) => Promise<Response>; // Async handler
  description?: string; // What this endpoint does
  requiresAuth?: boolean; // Whether authentication is required
  permissions?: string[]; // Required permissions to access
}
```

## UI Component Definition

Plugins can contribute UI components for WebUI and/or TUI:

```typescript
interface UIComponent {
  type: "web" | "tui" | "both"; // Where this component appears
  name: string; // Unique component identifier
  component: React.ComponentType<any> | BlessedWidget; // Actual component
  location: string; // Where to insert (e.g., 'sidebar', 'chat-panel')
  props?: Record<string, any>; // Default props to pass to component
}
```

## Event Handler Definition

Plugins can subscribe to system events for loose coupling:

```typescript
interface EventHandler {
  event: string; // Event name to listen for
  handler: (data: any) => Promise<void>; // Async handler function
  description?: string; // What this handler does
}
```

## Migration Definition

Plugins can define database schema changes:

```typescript
interface Migration {
  version: number; // Migration version (incremental)
  name: string; // Migration description
  up: (db: Database) => Promise<void>; // Apply migration
  down?: (db: Database) => Promise<void>; // Rollback migration (optional)
}
```

## Plugin Configuration Schema

Plugins can define configuration validation using JSON Schema:

```typescript
interface ConfigSchema {
  type: "object";
  properties: Record<string, any>; // JSON Schema properties
  required?: string[]; // Required configuration fields
}
```

## Plugin Loading & Lifecycle

### Discovery

Plugins are discovered at startup from these directories:

- `plugins/core/` - Built-in plugins (always loaded)
- `plugins/community/` - Installed from registry
- `plugins/local/` - User-created plugins

### Initialization Sequence

1. Core plugins load first (in alphabetical order)
2. Community plugins load next (in alphabetical order)
3. Local plugins load last (in alphabetical order)
4. For each plugin:
   - Validate manifest and configuration
   - Call `onLoad(context)` if present
   - Register all extensions (tools, roles, routes, etc.)
   - Execute any pending migrations

### Shutdown Sequence

1. Call `onUnload()` for each plugin (reverse order of loading)
2. Clean up registered extensions
3. Close database connections if needed

## Plugin Registry API

The plugin registry provides these endpoints for managing community plugins:

```http
GET    /api/plugins              # List all installed plugins
POST   /api/plugins/install      # Install plugin from registry
DELETE /api/plugins/:name        # Uninstall a plugin
POST   /api/plugins/:name/enable # Enable a plugin
POST   /api/plugins/:name/disable # Disable a plugin
GET    /api/plugins/:name/manifest # Get plugin manifest
GET    /api/plugins/:name/config  # Get plugin configuration
PUT    /api/plugins/:name/config  # Update plugin configuration
```

### Installation Process

1. Download plugin package from registry URL
2. Verify signature (if required by config)
3. Extract to `plugins/community/{name}/`
4. Validate manifest and dependencies
5. Execute installation lifecycle (`onLoad`)
6. Register with plugin manager

## Security Considerations

### Sandboxing

- Tools executing untrusted code run in isolated sandboxes (Firecracker/WASM)
- File system access restricted to plugin-specific directories
- Network access controlled via configurable allowlists
- Resource limits (CPU, memory, time) enforced per tool execution

### Permissions Model

- Plugins declare required permissions in their manifest
- Users grant/revoke permissions per plugin installation
- Agents inherit plugin tool permissions based on configuration
- Permission escalation requires explicit user approval

### Code Signing

- Community plugins must be signed by trusted publishers
- Signature verification occurs during installation
- Local plugins bypass signature verification (user trust boundary)
- Core plugins are verified via build process integrity checks

## Example Plugin: Dice Roller

Here's a complete example of a D&D 5e dice roller plugin:

```typescript
// plugins/core/dice-roller/plugin.ts
import { DiceParser } from "./dice-parser";

export const plugin: Plugin = {
  name: "dice-roller",
  version: "1.0.0",
  description: "D&D 5e dice rolling with advantage/disadvantage, modifiers, and roll history",
  author: "loop-lore team",

  tools: [
    {
      name: "roll_dice",
      description: 'Roll D&D dice (e.g., "2d6+3", "1d20adv", "4d6kh3")',
      parameters: {
        type: "object",
        properties: {
          notation: {
            type: "string",
            description: "Dice notation string",
          },
          reason: {
            type: "string",
            description: "Why this roll was made (optional)",
          },
        },
        required: ["notation"],
      },
      handler: async ({ notation, reason = "" }) => {
        try {
          const result = DiceParser.roll(notation);
          const breakdown = result.rolls.map((r) => r.value).join(", ");
          const total = result.total;

          let output = `🎲 ${notation} = ${total} [${breakdown}]`;
          if (reason) output += ` — ${reason}`;

          return {
            content: output,
            metadata: {
              type: "dice_roll",
              notation,
              total,
              rolls: result.rolls,
              ...result,
            },
          };
        } catch (error) {
          return {
            content: `❌ Invalid dice notation: ${notation}`,
            isError: true,
            metadata: { error: error.message },
          };
        }
      },
    },
  ],

  agentRoles: [
    {
      id: "dnd-gm",
      name: "D&D Game Master",
      description: "Runs D&D 5e sessions with rules knowledge",
      systemPrompt:
        "You are a D&D 5e Game Master. You have access to dice rolling tools and know the rules. Always use roll_dice for ability checks, attacks, and damage rolls.",
      tools: ["roll_dice"],
      modelConfig: {
        temperature: 0.7,
        maxTokens: 2048,
      },
    },
  ],
};
```

## Implementation Notes

### Naming Conventions

- Plugin names: kebab-case (e.g., `web-research`, `dnd-5e-tools`)
- Tool names: snake_case (e.g., `web_search`, `roll_dice`)
- Agent role IDs: kebab-case (e.g., `researcher`, `dnd-gm`)
- Event names: dot-separated (e.g., `chat.message.created`, `agent.role.loaded`)

### Directory Structure

```
plugins/
├── core/
│   ├── dice-roller/
│   │   ├── plugin.ts
│   │   ├── dice-parser.ts
│   │   └── package.json (optional)
│   ├── code-executor/
│   │   ├── plugin.ts
│   │   └── executor.ts
│   └── web-research/
│       ├── plugin.ts
│       └── search.ts
├── community/
│   ├── github-integration/
│   │   ├── plugin.ts
│   │   └── github-client.ts
│   └── latex-renderer/
│       ├── plugin.ts
│       └── renderer.ts
└── local/
    └── my-workflow-automation/
        ├── plugin.ts
        └── workflow.ts
```

### Version Compatibility

Plugins should declare compatibility with loop-lore versions:

- Use semantic versioning for both plugin and loop-lore
- Core team maintains compatibility matrix
- Plugin loader checks minimum/maximum supported versions
- Incompatible plugins are logged but not loaded

## Future Extensions

### Plugin Marketplace

- Web interface for browsing/installing community plugins
- User ratings, reviews, and download statistics
- Automatic update notifications
- Dependency resolution between plugins

### Plugin Bundles

- Groups of plugins that work together (e.g., "D&D Essentials")
- Shared configuration and inter-plugin communication
- Collective enable/disable operations

### Development Toolkit

- CLI plugin scaffolding tool
- Local development hot-reloading
- Testing framework for plugin extensions
- Documentation generator from plugin manifests
