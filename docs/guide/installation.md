# Installation

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git
- SQLite3 (for local development)

## Quick Start

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

## Development Scripts

| Command                | Description                                   |
| ---------------------- | --------------------------------------------- |
| `bun run dev`          | Start development server with hot reload      |
| `bun run start`        | Start production server                       |
| `bun run tui`          | Start TUI interface                           |
| `bun run build`        | Build static assets for production            |
| `bun run db:migrate`   | Run pending database migrations               |
| `bun run db:reset`     | Drop and recreate database (development only) |
| `bun run lint`         | Run ESLint on source code                     |
| `bun run format`       | Format code with Prettier                     |
| `bun run docs:dev`     | Start documentation development server        |
| `bun run docs:build`   | Build documentation for production            |
| `bun run docs:preview` | Preview built documentation                   |

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
