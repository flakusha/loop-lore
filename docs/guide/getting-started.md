# Getting Started with Loop Lore

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git
- SQLite3 (for local development)

## Installation

```bash
git clone <repository-url>
cd loop-lore
bun install
bun run dev
```

The server will be available at `http://localhost:3000`

## Development Scripts

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `bun run dev`        | Start development server           |
| `bun run start`      | Start production server            |
| `bun run tui`        | Start TUI interface                |
| `bun run build`      | Build static assets                |
| `bun run db:migrate` | Run database migrations            |
| `bun run docs:dev`   | Start documentation dev server     |
| `bun run docs:build` | Build documentation for production |
