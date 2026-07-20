> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Plugin System Specification

Status: Post-MVP (v0.2+). Plugin skeleton (`src/plugins/`) loads core/community/local plugins but has NO management API, NO sandbox, NO examples.

## Plugin Types

| Type      | Location             | Verification       |
| --------- | -------------------- | ------------------ |
| Core      | `plugins/core/`      | Bundled, read-only |
| Community | `plugins/community/` | Signature required |
| Local     | `plugins/local/`     | No verification    |

## Extension Points

- **Tools** — AI-executable functions (web search, code exec, etc.)
- **Agent Roles** — Pre-configured agent templates with capabilities
- **API Routes** — Custom REST endpoints
- **UI Components** — WebUI/TUI integration
- **Event Handlers** — System event subscriptions
- **Migrations** — DB schema changes

## Plugin Manifest

`plugin.ts` (or `.js`) exporting `Plugin` interface:

### PluginContext

Provided on `onLoad()`:

## Key Types

## Loading Lifecycle

## Registry API (future)

```
GET    /api/plugins                  # List installed
POST   /api/plugins/install          # Install from registry
DELETE /api/plugins/:name            # Uninstall
POST   /api/plugins/:name/enable
POST   /api/plugins/:name/disable
GET    /api/plugins/:name/manifest
GET    /api/plugins/:name/config
PUT    /api/plugins/:name/config
```

## Security

- Sandboxing: untrusted code in isolated containers (Firecracker/WASM)
- Network/file access via configurable allowlists
- Resource limits per execution
- Permission model: plugins declare required permissions, user grants
- Community plugins signed by trusted publishers
- Local plugins bypass signature (user trust)

## Standard Tool Categories

## Naming

- Plugins: kebab-case
- Tools: snake_case
- Agent roles: kebab-case
- Events: dot-separated (`chat.message.created`)
