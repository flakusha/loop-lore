# Artifacts System Specification

Extends Assets system for code, documents, datasets, notebooks — non-media creative outputs.
Polymorphic assets linked via `asset_links` to any entity (Epics, Tasks, Agents, Users).

## Core Concepts

Artifacts are specialized Assets for: code files, documents, data files, notebooks, config files, build artifacts, reports.

### vs Media Assets

| Aspect      | Media Assets (Images/Audio/Video) | Artifacts (Code/Docs/Data) |
| ----------- | --------------------------------- | -------------------------- |
| Primary Use | Illustration, atmosphere          | Creation, modification     |
| Size        | Often large (MBs)                 | Usually small (KBs)        |
| Editing     | External tools                    | In-context                 |
| Execution   | Passive                           | Can be executed            |
| Versioning  | Less frequent                     | Frequently versioned       |

## Artifact Types

| Type           | Examples                       | Labels                                                     |
| -------------- | ------------------------------ | ---------------------------------------------------------- |
| **Code**       | .py, .js, .ts, .go, .rs, .sh   | `source`, `script`, `module`, `library`, `test`, `fixture` |
| **Document**   | .md, .txt, .pdf, .docx         | `document`, `note`, `spec`, `report`, `readme`             |
| **Data**       | .csv, .json, .xml, .yaml, .sql | `dataset`, `database`, `fixture`, `migration`, `seed`      |
| **Notebook**   | .ipynb, .rmd                   | `notebook`, `experiment`, `analysis`, `tutorial`           |
| **Config**     | .env, .toml, .ini              | `config`, `settings`, `environment`, `secrets`, `template` |
| **Build/Deps** | package.json, Cargo.toml, etc. | `manifest`, `lockfile`, `build`, `dependency`              |

## Artifact Lifecycle

## Schema Extensions

## Artifact Service

## API Endpoints

| Method | Endpoint                    | Purpose                  |
| ------ | --------------------------- | ------------------------ |
| POST   | `/api/assets/code`          | Create code artifact     |
| POST   | `/api/assets/document`      | Create document artifact |
| POST   | `/api/assets/data`          | Create data artifact     |
| GET    | `/api/assets/:id/metadata`  | Enhanced metadata        |
| POST   | `/api/assets/:id/execute`   | Sandboxed execution      |
| POST   | `/api/assets/:id/query`     | Data querying            |
| POST   | `/api/assets/:id/transform` | Minify/format/convert    |
| GET    | `/api/assets/:id/preview`   | HTML preview             |

## UI Components

- Universal Artifact Viewer (auto-detect type + appropriate viewer)
- Code Editor (Monaco/Codemirror, 50+ langs, linting, integrated terminal)
- Document Viewer/Editor (markdown→HTML, rich text, PDF)
- Data Explorer (spreadsheet grid, filtering, sorting, charts, SQL query)
- Notebook Interface (cell execution, output display, kernel management)
- Config Editor (YAML/TOML/JSON/XML, schema validation, secret masking)

## Integration

- **Agent Runtime**: read/write/execute tools, artifact-based memory
- **Chat System**: drag-and-drop sharing, inline previews, execution results, `/run`/`/view`/`/edit` commands
- **Plugin System**: new artifact types, languages, execution envs, format converters

## Security

- Execution sandboxing (process isolation, seccomp-bpf, filesystem chroot)
- Malware scanning, policy enforcement, secret detection, size limits
- Access control: inherited permissions, explicit sharing, public links, audit logging

## Config

```yaml
artifacts:
  enabled: true
  limits: { maxFileSizeMb: 100, maxLineCount: 100000 }
  execution:
    enabled: true; defaultTimeoutMs: 30000
    allowedLanguages: [javascript, typescript, python, bash]
    allowedNetwork: false
  versioning: { enabled: true, strategy: content_hash, maxVersionsPerArtifact: 50 }
```

## Relationships

- Builds upon Assets system (storage, upload, linking)
- Complements Agent system (tangible outputs, iterative dev, agent-to-agent collaboration)
- Enables workflow automation, CI/CD pipeline, knowledge base
