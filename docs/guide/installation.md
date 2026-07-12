# Installation

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git
- SQLite3 (for local development)

## Quick Start

### macOS / Linux

```bash
# Clone the repository
git clone <repository-url>
cd loop-lore

# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# Start the development server
bun run dev

# The server will be available at http://localhost:3000
```

### Windows

> ⚠️ **Note:** The TUI interface requires either [Windows Terminal](https://aka.ms/terminal) or WSL (Windows Subsystem for Linux). PowerShell/CMD do not support the curses-based terminal UI.

```powershell
# Clone the repository
git clone <repository-url>
cd loop-lore

# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# Start the development server (HTTP only; HTTPS requires manual cert setup)
bun run dev

# The server will be available at http://localhost:3000
```

**Windows-specific considerations:**

- **TLS Certificates**: Auto-generation requires OpenSSL. Install [OpenSSL for Windows](https://slproweb.com/products/Win32OpenSSL.html) or configure manual certificates at the paths specified in `config.yaml`.
- **Binary Paths**: Ensure `llama-server.exe`, `llama-swap.exe`, and `sd-server.exe` are in your system PATH if using auto-start features.
- **TUI**: Use Windows Terminal or WSL for the best terminal experience.

## Development Scripts

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `bun run dev`          | Start development server with hot reload |
| `bun run start`        | Start production server                  |
| `bun run tui`          | Start TUI interface                      |
| `bun run build`        | Build static assets for production       |
| `bun run db:migrate`   | Run pending database migrations          |
| `bun run db:reset`     | ❌ Not implemented — no script exists    |
| `bun run lint`         | Run ESLint on source code                |
| `bun run format`       | Format code with Prettier                |
| `bun run docs:dev`     | Start documentation development server   |
| `bun run docs:build`   | Build documentation for production       |
| `bun run docs:preview` | Preview built documentation              |

## Environment Configuration

Create a `.env` file in the root directory:

```env
# Database configuration
DB_TYPE=sqlite
SQLITE_FILENAME=../loop-lore-data/loop-lore.db

# Server configuration
PORT=3000
HOST=localhost

# Feature flags
ENABLE_TUI=true
ENABLE_ASSISTANT=true
DOCS_ENABLED=true

# Asset storage (optional)
ASSET_STORAGE_BACKEND=local
# ASSET_S3_BUCKET=your-bucket  # Uncomment for S3
# ASSET_S3_REGION=us-east-1    # Uncomment for S3
```

## Docker Deployment

> ⚠️ **Note:** No `Dockerfile` exists in the repository yet. Docker deployment instructions are aspirational.

For production deployment using Docker:

```bash
# Build the Docker image
docker build -t loop-lore .

# Run the container
docker run -p 3000:3000 -v ./loop-lore-data:/app/loop-lore-data \
  -e SQLITE_FILENAME=loop-lore-data/loop-lore.db \
  loop-lore
```

## Verification

After starting the server, verify that:

1. The web interface is accessible at `http://localhost:3000`
2. The TUI can be started with `bun run tui` in a separate terminal
3. The documentation is accessible at `http://localhost:3000/docs/`
4. API endpoints are responding correctly
