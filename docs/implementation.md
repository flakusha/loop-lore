# Implementation Details

## Technology Stack

### Backend

- **Runtime**: [Bun](https://bun.sh) - Fast TypeScript/JavaScript runtime
- **Language**: TypeScript 5.0+
- **Database**:
  - Primary: SQLite (via `bun:sqlite` — native, no extra deps) for local development
  - Abstraction Layer: Drizzle ORM on bun:sqlite; swap to Drizzle Postgres/MySQL adapter for scale
- **ORM/Query Builder**: Drizzle ORM (migrations + type-safe queries)
- **Server**: Bun's built-in HTTP server (no additional framework needed)
- **Validation**: Custom validation functions (could be extended with Zod or Joi)

### Frontend

- **Web UI**: Preserved existing functionality (to be integrated)
- **TUI Mode**:
  - [`blessed`](https://github.com/chjj/blessed) - Curses-like library for Node.js
  - [`blessed-contrib`](https://github.com/yaronn/blessed-contrib) - Additional widgets for blessed
- **Styling**: Inline styling via blessed's API (no external CSS needed for TUI)
- **Optional Web Components**: For future web-based gallery/assistant integration (htmx/alpinejs as requested)

### Tooling

- **Package Manager**: Bun's built-in package manager
- **Type Checking**: TypeScript compiler (`bun run build` or `tsc`)
- **Linting**: ESLint (to be configured)
- **Formatting**: Prettier (to be configured)

## Core Implementation Details

### Database Layer

Located in `src/db/`

#### Database Approach

[Bun ships `bun:sqlite`](https://bun.sh/docs/api/sqlite) natively — fast, zero deps. [Kysely](https://kysely.dev/) provides type-safe query building on top.

1. **SQLite (default):** Kysely with `BunSqliteDialect`

   ```typescript
   import { Database } from "bun:sqlite";
   import { Kysely, SqliteDialect } from "kysely";

   const dialect = new SqliteDialect({
     database: new Database("data.db"),
   });
   const db = new Kysely<DB>({ dialect });
   ```

2. **Scaling up:** Swap to `PostgresDialect` from `kysely`

   ```typescript
   import { Kysely, PostgresDialect } from "kysely";
   import { Pool } from "pg";

   const dialect = new PostgresDialect({
     pool: new Pool({ connectionString: process.env.DATABASE_URL }),
   });
   const db = new Kysely<DB>({ dialect });
   ```

3. **Same queries, different dialect** — Kysely normalizes across SQLite and Postgres. Store arrays/enums as JSON text for compatibility.

4. **Database Initialization** (`src/db/index.ts`):
   - Reads `DB_TYPE` env var (default: `sqlite`)
   - Instantiates Kysely with the appropriate dialect
   - Runs pending migrations on startup via `Migrator`

#### Schema and Migrations

- Schema defined as TypeScript interfaces in `src/db/schema.ts` (Kysely table types)
- Migrations managed by Kysely Migrator, stored in `src/db/migrations/`
- Migration files are `.ts` with `up()`/`down()` exports
- See `docs/schema.md` for full table definitions

### Asset System (Replaces Gallery)

Located in `src/assets/`

See [`docs/assets.md`](./assets.md) for full specification.

The old gallery feature (`src/gallery/`) is replaced by the polymorphic assets system. Assets support images, audio, and video with flexible linking to any entity.

#### Service Layer (`src/assets/service.ts`)

- Encapsulates all asset database operations via Kysely
- Methods:
  - `create(file, metadata)`: Upload new asset, store file, generate compressed variants
  - `list(filter?)`: Retrieve assets with optional entity/label filtering
  - `link(assetId, entityType, entityId, label?)`: Link asset to entity
  - `unlink(assetId, entityType, entityId)`: Remove link
  - `delete(id)`: Remove asset + file from storage + all links

#### Controller (`src/assets/controller.ts`)

- Validates uploads (size, type, mime)
- Delegates to service

#### API Routes (`src/routes/assets.ts`)

- `GET /api/assets`: List assets (filter by entity/label)
- `POST /api/assets`: Upload new asset (multipart)
- `DELETE /api/assets/:id`: Remove asset
- `POST /api/assets/:id/link`: Link to entity
- `DELETE /api/assets/:id/link`: Unlink from entity
- `GET /api/assets/:id/raw`: Serve original file
- `GET /api/assets/:id/compressed`: Serve compressed variant
- `GET /api/assets/:id/thumb`: Serve thumbnail

### Assistant

Located in `src/assistant/`

See `docs/use-case-agentic-workspace.md` for the evolution of the assistant into an **Agent Runtime** for the agentic workspace mode.

#### Service Layer (`src/assistant/service.ts`)

- Contains the logic for processing user requests and generating responses
- Current implementation is rule-based for MVP:
  - Detects keywords in user message (`idea`, `suggest`, `stuck`, `blocked`, `character`, `motivation`)
  - Returns predefined responses with confidence scores
  - Designed to be easily replaced with LLM integration in the future
- Methods:
  - `process(request: AssistantRequest)`: Main entry point for processing requests

#### Controller (`src/assistant/controller.ts`)

- Wraps the service for use by routes
- Currently delegates directly to service

#### API Routes (`src/routes/assistant.ts`)

- Endpoint:
  - `POST /api/assistant`: Process user message and context, return assistant response
- Expects JSON body with:
  - `message`: User's input
  - `context`: Optional object with `chatId`, `characterIds`, `recentMessages`
- Returns JSON with `type`, `content`, and `confidence`

---

### Plugin System

Located in `src/plugins/` (planned)

See `docs/use-case-agentic-workspace.md` for the plugin architecture design.

The plugin system enables extensibility for both RPG and agentic modes:

- **Native plugins** (core): Bundled with loop-lore — dice roller, code executor, web research
- **Community plugins**: Third-party, installed from registry — D&D 5e tools, GitHub integration
- **Local plugins**: User-created, dropped in `plugins/local/`

#### Plugin Interface

```typescript
interface Plugin {
  name: string;
  version: string;
  description: string;
  tools?: ToolDefinition[]; // New tools for agents
  agentRoles?: AgentRoleDefinition[]; // New agent role templates
  uiComponents?: UIComponent[]; // WebUI/TUI components
  apiRoutes?: RouteDefinition[]; // Custom REST endpoints
  eventHandlers?: EventHandler[]; // React to system events
}
```

#### Plugin API Endpoints

- `GET /api/plugins` — List installed plugins
- `POST /api/plugins/install` — Install from registry
- `DELETE /api/plugins/:name` — Uninstall
- `POST /api/plugins/:name/enable` — Enable plugin
- `POST /api/plugins/:name/disable` — Disable plugin

---

### TUI Mode

Located in `src/tui/` (detailed in `tui.md`)

#### Main Application (`src/tui/app.ts`)

- Sets up the blessed screen
- Initializes and manages child components (chat view, gallery view, input handler)
- Handles global keyboard shortcuts (exit on Escape/q/Ctrl+C)
- Coordinates data flow between components

#### Chat View (`src/tui/chat.ts`)

- Displays message history using blessed's `Log` widget
- Methods for adding messages, setting current chat, loading gallery for chat
- Integrates with gallery service to display linked media
- Provides method to add items to gallery linked to current chat

#### Gallery View (`src/tui/gallery-view.ts`)

- Displays gallery items for current chat using blessed's `Box` widget
- Navigation: Left/Right arrows to browse items
- Actions: Enter to link item (feedback only, as linking is implicit via chatId), Delete to remove item
- Displays item details: type, URL, caption

#### Input Handler (`src/tui/input.ts`)

- Manages text input at bottom of screen using blessed's `Textbox` widget
- Captures Enter key to submit messages
- Clears input after submission
- Focus management

#### Data Flow in TUI

1. User types message and presses Enter
2. Input handler captures text, clears field, notifies callback
3. Chat view adds user message to display
4. Application calls assistant API with message and current chat context
5. Assistant response displayed in chat view
6. When chat ID is set, chat view loads and displays gallery for that chat
7. Gallery view allows browsing and managing gallery items for current chat

### API Integration

- TUI communicates with backend API using relative URLs (same origin)
- Base URL can be configured via environment variable if needed
- Uses `fetch` API for HTTP requests
- Error handling displays messages in chat view

## Configuration

Config loaded from project root: `config.yaml`, `config.yml`, or `config.toml`. Falls back to defaults if no file found.

### Config File (`config.yaml`)

```yaml
server:
  port: 3000
  host: "localhost"

db:
  type: sqlite # "sqlite" or "postgres"
  sqliteFilename: "../loop-lore-data/loop-lore.db"
  # For Postgres: type: postgres, url: "postgres://..."

assets:
  enabled: true
  uploadDir: "../loop-lore-data/uploads"
  maxFileSize: 10485760
  compression: true

assistant:
  enabled: true

logging:
  level: debug

tui:
  enabled: true

docs:
  enabled: true
```

See `config.yaml.example` in project root.

### Environment Variable Override

Env vars override config file values (12-factor style). Mapping in `src/config/load.ts`:

| Env Var                | Config Path          | Type    |
| ---------------------- | -------------------- | ------- |
| `PORT`                 | `server.port`        | number  |
| `HOST`                 | `server.host`        | string  |
| `DB_TYPE`              | `db.type`            | string  |
| `SQLITE_FILENAME`      | `db.sqliteFilename`  | string  |
| `DATABASE_URL`         | `db.url`             | string  |
| `ENABLE_ASSETS`        | `assets.enabled`     | boolean |
| `ASSETS_UPLOAD_DIR`    | `assets.uploadDir`   | string  |
| `ASSETS_MAX_FILE_SIZE` | `assets.maxFileSize` | number  |
| `ASSETS_COMPRESSION`   | `assets.compression` | boolean |
| `ENABLE_ASSISTANT`     | `assistant.enabled`  | boolean |
| `LOG_LEVEL`            | `logging.level`      | string  |
| `ENABLE_TUI`           | `tui.enabled`        | boolean |
| `ENABLE_DOCS`          | `docs.enabled`       | boolean |

String values coerced to target type (number, boolean) based on defaults.

### Internal Config Module

- `src/config/schema.ts` — Config interface + defaults
- `src/config/load.ts` — file detection (yaml → yml → toml), parse, deep merge, env override, validation

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) (v0.6.0+)
- Git
- SQLite3 (for local development)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd loop-lore

# Install dependencies
bun install

# Copy example configuration
cp .env.example .env

# Initialize database
bun run db:migrate

# Start development server
bun run dev

# In another terminal, start TUI
bun run tui
```

### Available Scripts

- `bun run dev`: Start development server
- `bun run start`: Start production server
- `bun run tui`: Start TUI interface
- `bun run build`: TypeScript compile to `./dist`
- `bun run db:migrate`: Run database migrations
- `bun run db:reset`: Drop and recreate database (dev only)
- `bun run lint`: Run ESLint
- `bun run format`: Format code with Prettier

## Production Deployment

### Disabling Documentation in Production

To disable documentation serving in production:

1. Set environment variable: `DOCS_ENABLED=false`
2. Or set in config: `{ docs: { enabled: false } }`
3. The server will check this flag and not serve documentation routes

### Environment-specific Configuration

- Create `.env.production` for production-specific variables
- Use `NODE_ENV=production` to enable production optimizations
- Consider using a process manager like PM2 or systemd

### Reverse Proxy Setup

Recommended to put behind a reverse proxy (NGINX, Caddy, etc.) for:

- SSL termination
- Load balancing
- Static file serving (if serving web UI)
- Rate limiting

## Testing Strategy

### Unit Tests

- Test individual services (gallery, assistant, database adapters)
- Mock external dependencies (database, APIs)
- Framework: Vitest or Bun's built-in test runner

### Integration Tests

- Test API endpoints with supertest-like library
- Test database migrations and rollbacks
- Test service interactions

### End-to-End Tests

- Test full user flows (though challenging for TUI)
- Consider using tools like `playwright` for terminal testing
- Manual testing checklist for TUI functionality

### Testing TUI

- Unit test individual components (chat view, gallery view, input handler)
- Integration test component interactions
- Manual verification of keyboard shortcuts and screen updates

## Future Enhancements

### Database

- Add connection pooling for better performance
- Implement read replicas for scaling
- Add migration rollback scripts
- Support for MongoDB or other NoSQL stores via adapter pattern

### TUI

- Add mouse support (where terminal supports it)
- Implement themes and customizable color schemes
- Add search functionality for chat history and gallery
- Implement split-screen views (chat, gallery, user list)
- Add support for images in terminal (where supported via sixel or similar)

### Gallery

- Add thumbnail generation and preview
- Support for video and audio files
- Drag-and-drop upload (in web version)
- Bulk operations (delete multiple, export/import)

### Assistant

- Integrate with actual LLMs (OpenAI, Anthropic, local models)
- Add conversation memory and context awareness
- Implement prompt engineering for better responses
- Add ability to invoke tools (search, image generation, etc.)

### Web UI Integration

- Implement htmx-based gallery and assistant components
- Use Alpine.js for client-side interactivity
- Ensure parity between TUI and web UI features
- Add responsive design for mobile devices

## Troubleshooting

### Common Issues

#### Database Connection Failures

1. Check environment variables for database connection
2. Verify database server is running and accessible
3. Check that database user has appropriate permissions
4. For SQLite, ensure file directory is writable

#### TUI Display Issues

1. Ensure terminal supports required features (colors, Unicode)
2. Try resizing terminal window
3. Check for conflicting terminal applications or tmux/screen settings
4. Run with `TERM=xterm-256color` if color issues occur

#### API Connection Problems

1. Verify backend server is running
2. Check CORS settings if serving web UI from different origin
3. Ensure API_BASE_URL is correctly configured
4. Check firewall/network settings

### Logs and Debugging

- Application logs can be enabled via environment variable `LOG_LEVEL=debug`
- Errors are logged to console and can be redirected to file
- TUI has basic error display in chat view
- Consider implementing a debug mode for TUI that shows API requests/responses

## License

This project is licensed under the LGPL-3.0 License - see the [LICENSE](../../LICENSE) file for details.
